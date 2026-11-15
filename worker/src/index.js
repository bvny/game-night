// Burrito Gang · Game Night API (Cloudflare Worker)
//
// Bindings / settings (see SETUP.md):
//   DB                      D1 database binding
//   FRONTEND_URL            e.g. https://gaymers.burritogang.com
//   DISCORD_CLIENT_ID       Discord application client ID
//   DISCORD_CLIENT_SECRET   (secret) Discord application client secret
//   DISCORD_GUILD_ID        Burrito Gang server ID
//   DISCORD_REQUIRED_ROLE_ID  optional: role needed to get in
//   STEAM_API_KEY           (secret) from steamcommunity.com/dev/apikey
//   SESSION_SECRET          (secret) long random string used to sign logins
//   ALLOWED_ORIGINS         optional: comma-separated extra origins (e.g. local testing)

const DISCORD_API = 'https://discord.com/api/v10';
const STEAM_API = 'https://api.steampowered.com';
const STORE_API = 'https://store.steampowered.com/api';
const SESSION_DAYS = 30;
const CC_LIST = ['ie', 'gb', 'us'];

// Steam store category IDs
const COOP_CATS = new Set([9, 38, 39, 48]);              // Co-op, Online Co-op, Shared/Split Screen Co-op, LAN Co-op
const PVP_CATS = new Set([49, 36, 37, 47]);              // PvP, Online PvP, Shared/Split Screen PvP, LAN PvP
const MULTI_CATS = new Set([1, 9, 20, 24, 27, 36, 37, 38, 39, 47, 48, 49]);
const SHOW_CATS = new Set([1, 9, 24, 27, 36, 37, 38, 39, 47, 48, 49]);

export default {
  async fetch(req, env, ctx) {
    if (req.method === 'OPTIONS') return cors(req, env, new Response(null, { status: 204 }));
    try {
      return cors(req, env, await route(req, env, ctx));
    } catch (e) {
      console.error(e);
      return cors(req, env, json({ error: 'server_error', message: String(e && e.message || e) }, 500));
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(hourly(env));
  },
};

/* ------------------------------------------------------------------ routing */

async function route(req, env, ctx) {
  const url = new URL(req.url);
  const p = url.pathname.replace(/\/+$/, '') || '/';

  if (p === '/') return json({ ok: true, name: 'burrito-game-night-api' });
  if (p === '/auth/login') return authLogin(env, url);
  if (p === '/auth/callback') return authCallback(req, env, ctx, url);

  if (p.startsWith('/api/')) {
    const user = await authUser(req, env);
    if (!user) return json({ error: 'unauthorized' }, 401);

    if (p === '/api/me' && req.method === 'GET') return json({ user: publicMe(user) });
    if (p === '/api/crew' && req.method === 'GET') return crew(env);
    if (p === '/api/steam/link' && req.method === 'POST') return steamLink(req, env, user);
    if (p === '/api/steam/link' && req.method === 'DELETE') {
      await env.DB.batch([
        env.DB.prepare('UPDATE users SET steam_id=NULL, steam_private=0, game_count=0, last_sync=NULL WHERE id=?').bind(user.id),
        env.DB.prepare('DELETE FROM library WHERE user_id=?').bind(user.id),
      ]);
      return json({ user: publicMe(await getUser(env, user.id)) });
    }
    if (p === '/api/steam/sync' && req.method === 'POST') return steamSyncMe(env, user);
    const m = p.match(/^\/api\/game\/(\d+)$/);
    if (m && req.method === 'GET') return gameDetails(env, ctx, +m[1], url.searchParams.get('cc') || 'ie');
  }
  return json({ error: 'not_found' }, 404);
}

/* ------------------------------------------------------------------ auth */

function authLogin(env, url) {
  const state = crypto.randomUUID();
  const q = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    response_type: 'code',
    redirect_uri: `${url.origin}/auth/callback`,
    scope: 'identify guilds.members.read connections',
    state,
    prompt: 'none',
  });
  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://discord.com/oauth2/authorize?${q}`,
      'Set-Cookie': `bg_state=${state}; Path=/auth; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}

async function authCallback(req, env, ctx, url) {
  const front = env.FRONTEND_URL.replace(/\/$/, '');
  const go = (hash, clear = true) => new Response(null, {
    status: 302,
    headers: {
      Location: `${front}/#${hash}`,
      ...(clear ? { 'Set-Cookie': 'bg_state=; Path=/auth; Max-Age=0; HttpOnly; Secure; SameSite=Lax' } : {}),
    },
  });
  const fail = reason => go(`auth_error=${reason}`);

  if (url.searchParams.get('error')) return fail('denied');
  const state = url.searchParams.get('state');
  if (!state || state !== getCookie(req, 'bg_state')) return fail('state');

  // 1. swap the code for an access token
  const tokRes = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: url.searchParams.get('code') || '',
      redirect_uri: `${url.origin}/auth/callback`,
    }),
  });
  if (!tokRes.ok) { console.error('token exchange', tokRes.status, await tokRes.text()); return fail('error'); }
  const { access_token } = await tokRes.json();
  const auth = { headers: { Authorization: `Bearer ${access_token}` } };

  // 2. who are they, are they in the server, have they linked Steam on Discord?
  const [uRes, mRes, cRes] = await Promise.all([
    fetch(`${DISCORD_API}/users/@me`, auth),
    fetch(`${DISCORD_API}/users/@me/guilds/${env.DISCORD_GUILD_ID}/member`, auth),
    fetch(`${DISCORD_API}/users/@me/connections`, auth),
  ]);
  if (!uRes.ok) return fail('error');
  if (mRes.status === 429 || mRes.status >= 500) return fail('error');
  if (!mRes.ok) return fail('not_member');

  const du = await uRes.json();
  const member = await mRes.json();
  if (env.DISCORD_REQUIRED_ROLE_ID && !(member.roles || []).includes(env.DISCORD_REQUIRED_ROLE_ID)) return fail('missing_role');

  const conns = cRes.ok ? await cRes.json() : [];
  const steamConn = Array.isArray(conns) ? conns.find(c => c.type === 'steam' && /^\d{17}$/.test(c.id)) : null;
  const name = member.nick || du.global_name || du.username;
  const avatar = du.avatar ? `https://cdn.discordapp.com/avatars/${du.id}/${du.avatar}.png?size=64` : null;
  const now = Date.now();

  // 3. save them (auto-link Steam from their Discord connection if it's not taken)
  let autoSteam = null;
  if (steamConn) {
    const taken = await env.DB.prepare('SELECT id FROM users WHERE steam_id=? AND id!=?').bind(steamConn.id, du.id).first();
    if (!taken) autoSteam = steamConn.id;
  }
  await env.DB.prepare(
    `INSERT INTO users (id, name, avatar, steam_id, created_at, last_login) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, avatar=excluded.avatar, last_login=excluded.last_login,
       steam_id=COALESCE(users.steam_id, excluded.steam_id)`
  ).bind(du.id, name, avatar, autoSteam, now, now).run();

  const user = await getUser(env, du.id);
  if (user.steam_id && !user.last_sync) ctx.waitUntil(syncSteam(env, user).catch(e => console.error('first sync', e)));

  // 4. hand the browser a signed login token
  const token = await signToken(env, { uid: du.id, exp: Math.floor(now / 1000) + SESSION_DAYS * 86400 });
  return go(`auth=${token}`);
}

async function authUser(req, env) {
  const h = req.headers.get('Authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  const payload = token && await verifyToken(env, token);
  return payload ? getUser(env, payload.uid) : null;
}

const getUser = (env, id) => env.DB.prepare('SELECT * FROM users WHERE id=?').bind(id).first();
const publicMe = u => ({
  id: u.id, name: u.name, avatar: u.avatar, steam_id: u.steam_id || null,
  steam_private: !!u.steam_private, game_count: u.game_count || 0, last_sync: u.last_sync || null,
});

/* ------------------------------------------------------------------ steam */

async function resolveSteamId(env, input) {
  if (!input) return null;
  let m = input.match(/(?:^|\/|\b)(7656\d{13})(?:\b|\/|$)/);
  if (m) return m[1];
  m = input.match(/steamcommunity\.com\/id\/([^/?#\s]+)/i);
  const vanity = m ? m[1] : (/^[\w-]{2,32}$/.test(input) ? input : null);
  if (!vanity) return null;
  const r = await fetch(`${STEAM_API}/ISteamUser/ResolveVanityURL/v1/?key=${env.STEAM_API_KEY}&vanityurl=${encodeURIComponent(vanity)}`);
  if (!r.ok) return null;
  const d = await r.json();
  return d && d.response && d.response.success === 1 ? d.response.steamid : null;
}

async function steamLink(req, env, user) {
  const body = await req.json().catch(() => ({}));
  const sid = await resolveSteamId(env, String(body.input || '').trim());
  if (!sid) return json({ error: 'steam_not_found', message: "Couldn't find that Steam profile. Try your full profile link." }, 400);
  const taken = await env.DB.prepare('SELECT id FROM users WHERE steam_id=? AND id!=?').bind(sid, user.id).first();
  if (taken) return json({ error: 'steam_taken', message: 'That Steam account is already linked to someone else.' }, 409);
  await env.DB.prepare('UPDATE users SET steam_id=?, steam_private=0, last_sync=NULL WHERE id=?').bind(sid, user.id).run();
  const sync = await syncSteam(env, { ...user, steam_id: sid });
  return json({ user: publicMe(await getUser(env, user.id)), sync });
}

async function steamSyncMe(env, user) {
  if (!user.steam_id) return json({ error: 'no_steam', message: 'Link your Steam account first.' }, 400);
  if (user.last_sync && Date.now() - user.last_sync < 60_000 && !user.steam_private) {
    return json({ user: publicMe(user), sync: { skipped: true } });
  }
  const sync = await syncSteam(env, user);
  return json({ user: publicMe(await getUser(env, user.id)), sync });
}

async function syncSteam(env, user) {
  const r = await fetch(`${STEAM_API}/IPlayerService/GetOwnedGames/v1/?key=${env.STEAM_API_KEY}&steamid=${user.steam_id}&include_appinfo=1&include_played_free_games=1&format=json`);
  if (!r.ok) throw new Error('Steam API ' + r.status);
  const d = await r.json();
  const games = d && d.response && d.response.games;
  const now = Date.now();

  // Private "Game details" -> Steam returns an empty response
  if (!Array.isArray(games)) {
    await env.DB.prepare('UPDATE users SET steam_private=1, last_sync=? WHERE id=?').bind(now, user.id).run();
    return { private: true, count: 0 };
  }

  const stmts = [env.DB.prepare('DELETE FROM library WHERE user_id=?').bind(user.id)];
  const ins = env.DB.prepare('INSERT INTO library (user_id, appid, minutes, minutes_2w) VALUES (?, ?, ?, ?)');
  const gIns = env.DB.prepare(
    `INSERT INTO games (appid, name) VALUES (?, ?)
     ON CONFLICT(appid) DO UPDATE SET name=excluded.name WHERE games.name IS NOT excluded.name`
  );
  let total = 0, total2w = 0;
  for (const g of games) {
    const m = g.playtime_forever || 0, m2 = g.playtime_2weeks || 0;
    total += m; total2w += m2;
    stmts.push(ins.bind(user.id, g.appid, m, m2));
    stmts.push(gIns.bind(g.appid, g.name || null));
  }
  const day = new Date(now).toISOString().slice(0, 10);
  stmts.push(env.DB.prepare('INSERT OR REPLACE INTO snapshots (user_id, day, minutes, minutes_2w, games) VALUES (?, ?, ?, ?, ?)').bind(user.id, day, total, total2w, games.length));
  stmts.push(env.DB.prepare('UPDATE users SET steam_private=0, last_sync=?, game_count=? WHERE id=?').bind(now, games.length, user.id));
  for (let i = 0; i < stmts.length; i += 200) await env.DB.batch(stmts.slice(i, i + 200));
  return { private: false, count: games.length };
}

/* ------------------------------------------------------------------ crew data */

async function crew(env) {
  const [users, lib, games] = await Promise.all([
    env.DB.prepare('SELECT id, name, avatar, steam_id, steam_private, game_count, last_sync FROM users ORDER BY name COLLATE NOCASE').all(),
    env.DB.prepare('SELECT user_id, appid, minutes, minutes_2w FROM library').all(),
    env.DB.prepare('SELECT * FROM games WHERE appid IN (SELECT DISTINCT appid FROM library)').all(),
  ]);
  const library = {};
  for (const r of lib.results) (library[r.user_id] = library[r.user_id] || {})[r.appid] = [r.minutes, r.minutes_2w];
  const out = {};
  for (const g of games.results) {
    out[g.appid] = {
      name: g.name, is_free: !!g.is_free, coop: !!g.coop, pvp: !!g.pvp, multi: !!g.multi,
      max_players: g.max_players, genres: g.genres ? JSON.parse(g.genres) : [],
      prices: g.prices ? JSON.parse(g.prices) : null, meta_at: g.meta_at,
    };
  }
  return json({
    users: users.results.map(u => ({
      id: u.id, name: u.name, avatar: u.avatar, steam_id: !!u.steam_id,
      steam_private: !!u.steam_private, game_count: u.game_count, last_sync: u.last_sync,
    })),
    library,
    games: out,
  });
}

/* ------------------------------------------------------------------ game details (trailer, description) */

async function gameDetails(env, ctx, appid, cc) {
  if (!CC_LIST.includes(cc)) cc = 'ie';
  const cache = caches.default;
  const key = new Request(`https://cache.burrito.local/game/${appid}/${cc}`);
  const hit = await cache.match(key);
  if (hit) return hit;

  const r = await fetch(`${STORE_API}/appdetails?appids=${appid}&cc=${cc}&l=english`);
  if (!r.ok) return json({ error: 'store_error' }, 502);
  const entry = (await r.json())[appid];
  if (!entry || !entry.success) return json({ error: 'not_found' }, 404);

  const a = entry.data;
  ctx.waitUntil(saveMeta(env, appid, a, cc).catch(e => console.error('saveMeta', e)));
  const res = json(shapeDetails(appid, a), 200, { 'Cache-Control': 'public, max-age=43200' });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

function shapeDetails(appid, a) {
  return {
    appid,
    name: a.name,
    description: cleanText(a.short_description),
    header: a.header_image,
    genres: (a.genres || []).map(g => g.description),
    categories: (a.categories || []).filter(c => SHOW_CATS.has(c.id)).map(c => c.description),
    is_free: !!a.is_free,
    price: a.price_overview ? {
      final: a.price_overview.final, initial: a.price_overview.initial,
      discount: a.price_overview.discount_percent, currency: a.price_overview.currency,
    } : null,
    release: a.release_date ? a.release_date.date : null,
    developers: a.developers || [],
    movie: pickMovie(a.movies),
    screenshots: (a.screenshots || []).slice(0, 6).map(s => s.path_thumbnail),
  };
}

function pickMovie(movies) {
  if (!Array.isArray(movies) || !movies.length) return null;
  const m = movies.find(x => x.highlight) || movies[0];
  const https = u => (u ? String(u).replace(/^http:/, 'https:') : null);
  return {
    name: m.name || null,
    poster: https(m.thumbnail),
    mp4: https((m.mp4 && (m.mp4['480'] || m.mp4.max)) || null),
    webm: https((m.webm && (m.webm['480'] || m.webm.max)) || null),
    hls: https(m.hls_h264 || null),
  };
}

async function saveMeta(env, appid, a, cc) {
  const cats = (a.categories || []).map(c => c.id);
  const coop = cats.some(c => COOP_CATS.has(c));
  const pvp = cats.some(c => PVP_CATS.has(c));
  const multi = cats.some(c => MULTI_CATS.has(c));
  const row = await env.DB.prepare('SELECT prices FROM games WHERE appid=?').bind(appid).first();
  const prices = row && row.prices ? JSON.parse(row.prices) : {};
  if (a.price_overview) prices[cc] = { final: a.price_overview.final, initial: a.price_overview.initial, discount: a.price_overview.discount_percent };
  await env.DB.prepare(
    `INSERT INTO games (appid, name, is_free, coop, pvp, multi, genres, prices, meta_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(appid) DO UPDATE SET name=excluded.name, is_free=excluded.is_free, coop=excluded.coop, pvp=excluded.pvp,
       multi=excluded.multi, genres=excluded.genres, prices=excluded.prices, meta_at=excluded.meta_at`
  ).bind(
    appid, a.name || null, a.is_free ? 1 : 0, coop ? 1 : 0, pvp ? 1 : 0, multi ? 1 : 0,
    JSON.stringify((a.genres || []).map(g => g.description).slice(0, 4)), JSON.stringify(prices), Date.now()
  ).run();
}

async function fillPrices(env, ids, cc) {
  if (!ids.length) return;
  const r = await fetch(`${STORE_API}/appdetails?appids=${ids.join(',')}&cc=${cc}&filters=price_overview`);
  if (!r.ok) return;
  const d = await r.json();
  const rows = (await env.DB.prepare(`SELECT appid, prices FROM games WHERE appid IN (${ids.map(() => '?').join(',')})`).bind(...ids).all()).results;
  const stmts = [];
  for (const row of rows) {
    const e = d[row.appid];
    if (!e) continue;
    const po = e.success && e.data && e.data.price_overview;
    const prices = row.prices ? JSON.parse(row.prices) : {};
    // null = "not sold in this region", so we don't keep re-asking
    prices[cc] = po ? { final: po.final, initial: po.initial, discount: po.discount_percent } : null;
    stmts.push(env.DB.prepare('UPDATE games SET prices=? WHERE appid=?').bind(JSON.stringify(prices), row.appid));
  }
  if (stmts.length) await env.DB.batch(stmts);
}

/* ------------------------------------------------------------------ hourly job */

async function hourly(env) {
  const now = Date.now();

  // 1. Re-sync libraries older than 20 hours (a few per run, keeps us inside free-plan limits)
  const stale = (await env.DB.prepare(
    'SELECT * FROM users WHERE steam_id IS NOT NULL AND (last_sync IS NULL OR last_sync < ?) ORDER BY last_sync LIMIT 4'
  ).bind(now - 20 * 3600e3).all()).results;
  for (const u of stale) {
    try { await syncSteam(env, u); } catch (e) { console.error('sync', u.id, e); }
  }

  // 2. Fill in store info (co-op/PvP, genres, prices), games owned by the most people first
  const need = (await env.DB.prepare(
    `SELECT l.appid, COUNT(*) AS owners FROM library l LEFT JOIN games g ON g.appid = l.appid
     WHERE g.meta_at IS NULL OR g.meta_at < ?
     GROUP BY l.appid ORDER BY owners DESC LIMIT 12`
  ).bind(now - 7 * 86400e3).all()).results;
  for (const { appid } of need) {
    try {
      const r = await fetch(`${STORE_API}/appdetails?appids=${appid}&cc=ie&l=english`);
      if (r.status === 429) break; // store rate limit: try again next hour
      const e = (await r.json())[appid];
      if (e && e.success) await saveMeta(env, appid, e.data, 'ie');
      else await env.DB.prepare('UPDATE games SET meta_at=? WHERE appid=?').bind(now, appid).run();
    } catch (err) { console.error('meta', appid, err); }
  }

  // 3. Prices for any region we don't have yet (one batched request per region)
  for (const cc of CC_LIST) {
    try {
      const missing = (await env.DB.prepare(
        `SELECT appid FROM games WHERE is_free = 0 AND meta_at IS NOT NULL AND (prices IS NULL OR prices NOT LIKE ?)
           AND appid IN (SELECT appid FROM library) LIMIT 40`
      ).bind(`%"${cc}"%`).all()).results.map(x => x.appid);
      await fillPrices(env, missing, cc);
    } catch (err) { console.error('prices', cc, err); }
  }
}

/* ------------------------------------------------------------------ helpers */

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
}

function cors(req, env, res) {
  const r = new Response(res.body, res);
  const origin = req.headers.get('Origin');
  const allowed = [env.FRONTEND_URL, ...String(env.ALLOWED_ORIGINS || '').split(',')]
    .map(s => (s || '').trim().replace(/\/$/, '')).filter(Boolean);
  if (origin && allowed.includes(origin)) {
    r.headers.set('Access-Control-Allow-Origin', origin);
    r.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    r.headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    r.headers.set('Access-Control-Max-Age', '86400');
  }
  r.headers.append('Vary', 'Origin');
  return r;
}

function getCookie(req, name) {
  const m = (req.headers.get('Cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? m[1] : null;
}

function cleanText(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .trim();
}

// --- signed login tokens (HMAC-SHA256) ---
const enc = new TextEncoder();
const toB64u = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const hmacKey = secret => crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

async function signToken(env, payload) {
  const body = toB64u(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(env.SESSION_SECRET), enc.encode(body));
  return `${body}.${toB64u(sig)}`;
}

async function verifyToken(env, token) {
  try {
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(env.SESSION_SECRET), fromB64u(sig), enc.encode(body));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(fromB64u(body)));
    return p.exp > Date.now() / 1000 ? p : null;
  } catch { return null; }
}

