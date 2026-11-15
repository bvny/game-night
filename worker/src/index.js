// Burrito Gang · Game Night API (Cloudflare Worker)
//
// Bindings / settings (see SETUP.md):
//   DB                        D1 database binding
//   FRONTEND_URL              e.g. https://gaymers.burritogang.com
//   DISCORD_CLIENT_ID         Discord application client ID
//   DISCORD_CLIENT_SECRET     (secret) Discord application client secret
//   DISCORD_GUILD_ID          Burrito Gang server ID
//   DISCORD_REQUIRED_ROLE_ID  optional: role needed to get in
//   DISCORD_WEBHOOK_URL       (secret) optional: webhook for the #game-night channel
//   STEAM_API_KEY             (secret) from steamcommunity.com/dev/apikey
//   SESSION_SECRET            (secret) long random string used to sign logins
//   ALLOWED_ORIGINS           optional: comma-separated extra origins (e.g. local testing)

const DISCORD_API = 'https://discord.com/api/v10';
const STEAM_API = 'https://api.steampowered.com';
const STORE = 'https://store.steampowered.com';
const SESSION_DAYS = 30;
const CC_LIST = ['ie', 'gb', 'us'];
const CC_UPPER = { ie: 'IE', gb: 'GB', us: 'US' };
const META_MAX_AGE = 3 * 86400e3;   // refresh store info every 3 days
const CHART_MAX_AGE = 20 * 3600e3;  // refresh Discovery charts roughly daily

// Steam store category IDs + tag names used to decide co-op / PvP / multiplayer
const COOP_CATS = new Set([9, 38, 39, 48]);
const PVP_CATS = new Set([49, 36, 37, 47]);
const MULTI_CATS = new Set([1, 9, 20, 24, 27, 36, 37, 38, 39, 44, 47, 48, 49]);
const SHOW_CATS = new Set([1, 9, 24, 27, 36, 37, 38, 39, 47, 48, 49]);
const COOP_TAGS = new Set(['Co-op', 'Online Co-Op', 'Local Co-Op', 'Co-op Campaign']);
const PVP_TAGS = new Set(['PvP', 'Competitive', 'Battle Royale', 'MOBA', 'Team-Based', 'Hero Shooter', 'eSports', 'Arena Shooter']);
const MULTI_TAGS = new Set(['Multiplayer', 'Massively Multiplayer', 'Local Multiplayer', 'Party Game', 'Party', '4 Player Local', 'Split Screen', 'Social Deduction', 'MMORPG']);

export default {
  async fetch(req, env, ctx) {
    if (req.method === 'OPTIONS') return cors(req, env, new Response(null, { status: 204 }));
    try {
      await ensureSchema(env);
      return cors(req, env, await route(req, env, ctx));
    } catch (e) {
      console.error(e);
      return cors(req, env, json({ error: 'server_error', message: String(e && e.message || e) }, 500));
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(ensureSchema(env).then(() => hourly(env)));
  },
};

/* ------------------------------------------------------------------ schema (auto-upgrades) */

let schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady) return;
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS charts (kind TEXT NOT NULL, rank INTEGER NOT NULL, appid INTEGER NOT NULL, value INTEGER, fetched_at INTEGER, PRIMARY KEY (kind, rank))'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS pitches (id INTEGER PRIMARY KEY AUTOINCREMENT, appid INTEGER NOT NULL, by_user TEXT NOT NULL, to_users TEXT, note TEXT, created_at INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS votes (pitch_id INTEGER NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (pitch_id, user_id))'),
  ]);
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS hidden_games (user_id TEXT NOT NULL, appid INTEGER NOT NULL, PRIMARY KEY (user_id, appid))').run();
  let added = false;
  for (const col of ['description TEXT', 'header TEXT', 'review_score INTEGER', 'review_pct INTEGER', 'review_count INTEGER', 'modded INTEGER DEFAULT 0', 'workshop INTEGER DEFAULT 0']) {
    try { await env.DB.prepare(`ALTER TABLE games ADD COLUMN ${col}`).run(); added = true; }
    catch (e) { if (!/duplicate column/i.test(String(e && e.message || e))) throw e; }
  }
  // New store fields were added: re-fetch store info so every game gets them
  if (added) await env.DB.prepare('UPDATE games SET meta_at = NULL').run();
  schemaReady = true;
}

/* ------------------------------------------------------------------ routing */

async function route(req, env, ctx) {
  const url = new URL(req.url);
  const p = url.pathname.replace(/\/+$/, '') || '/';

  if (p === '/') return json({ ok: true, name: 'burrito-game-night-api', version: 2 });
  if (p === '/auth/login') return authLogin(env, url);
  if (p === '/auth/callback') return authCallback(req, env, ctx, url);

  if (p.startsWith('/api/')) {
    const user = await authUser(req, env);
    if (!user) return json({ error: 'unauthorized' }, 401);
    const M = req.method;
    let m;

    if (p === '/api/me' && M === 'GET') return json({ user: publicMe(user) });
    if (p === '/api/crew' && M === 'GET') return crew(env, ctx);
    if (p === '/api/discovery' && M === 'GET') return discovery(env);
    if (p === '/api/search' && M === 'GET') return search(env, ctx, url);
    if (p === '/api/steam/link' && M === 'POST') return steamLink(req, env, ctx, user);
    if (p === '/api/steam/link' && M === 'DELETE') {
      await env.DB.batch([
        env.DB.prepare('UPDATE users SET steam_id=NULL, steam_private=0, game_count=0, last_sync=NULL WHERE id=?').bind(user.id),
        env.DB.prepare('DELETE FROM library WHERE user_id=?').bind(user.id),
      ]);
      return json({ user: publicMe(await getUser(env, user.id)) });
    }
    if (p === '/api/steam/sync' && M === 'POST') return steamSyncMe(env, ctx, user);
    if (p === '/api/pitches' && M === 'GET') return listPitches(env);
    if (p === '/api/pitches' && M === 'POST') return createPitch(req, env, ctx, user);
    if ((m = p.match(/^\/api\/pitches\/(\d+)\/vote$/)) && M === 'POST') return toggleVote(env, user, +m[1]);
    if ((m = p.match(/^\/api\/pitches\/(\d+)$/)) && M === 'DELETE') return deletePitch(env, user, +m[1]);
    if (p === '/api/announce' && M === 'POST') return announce(req, env, ctx, user);
    if ((m = p.match(/^\/api\/profile\/(\d+)$/)) && M === 'GET') return profile(env, ctx, user, m[1]);
    if (p === '/api/profile/hidden' && M === 'POST') return setHidden(req, env, user);
    if ((m = p.match(/^\/api\/game\/(\d+)$/)) && M === 'GET') return gameDetails(env, ctx, +m[1], url.searchParams.get('cc') || 'ie');
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
  const go = hash => new Response(null, {
    status: 302,
    headers: { Location: `${front}/#${hash}`, 'Set-Cookie': 'bg_state=; Path=/auth; Max-Age=0; HttpOnly; Secure; SameSite=Lax' },
  });
  const fail = reason => go(`auth_error=${reason}`);

  if (url.searchParams.get('error')) return fail('denied');
  const state = url.searchParams.get('state');
  if (!state || state !== getCookie(req, 'bg_state')) return fail('state');

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
  if (user.steam_id && !user.last_sync) ctx.waitUntil(syncSteam(env, user).then(() => fillLibraryMeta(env)).catch(e => console.error('first sync', e)));

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

/* ------------------------------------------------------------------ steam library */

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

async function steamLink(req, env, ctx, user) {
  const body = await req.json().catch(() => ({}));
  const sid = await resolveSteamId(env, String(body.input || '').trim());
  if (!sid) return json({ error: 'steam_not_found', message: "Couldn't find that Steam profile. Try your full profile link." }, 400);
  const taken = await env.DB.prepare('SELECT id FROM users WHERE steam_id=? AND id!=?').bind(sid, user.id).first();
  if (taken) return json({ error: 'steam_taken', message: 'That Steam account is already linked to someone else.' }, 409);
  await env.DB.prepare('UPDATE users SET steam_id=?, steam_private=0, last_sync=NULL WHERE id=?').bind(sid, user.id).run();
  const sync = await syncSteam(env, { ...user, steam_id: sid });
  ctx.waitUntil(fillLibraryMeta(env).catch(e => console.error('meta after link', e)));
  return json({ user: publicMe(await getUser(env, user.id)), sync });
}

async function steamSyncMe(env, ctx, user) {
  if (!user.steam_id) return json({ error: 'no_steam', message: 'Link your Steam account first.' }, 400);
  if (user.last_sync && Date.now() - user.last_sync < 60_000 && !user.steam_private) {
    return json({ user: publicMe(user), sync: { skipped: true } });
  }
  const sync = await syncSteam(env, user);
  ctx.waitUntil(fillLibraryMeta(env).catch(e => console.error('meta after sync', e)));
  return json({ user: publicMe(await getUser(env, user.id)), sync });
}

async function syncSteam(env, user) {
  const r = await fetch(`${STEAM_API}/IPlayerService/GetOwnedGames/v1/?key=${env.STEAM_API_KEY}&steamid=${user.steam_id}&include_appinfo=1&include_played_free_games=1&format=json`);
  if (!r.ok) throw new Error('Steam API ' + r.status);
  const d = await r.json();
  const games = d && d.response && d.response.games;
  const now = Date.now();

  if (!Array.isArray(games)) {
    await env.DB.prepare('UPDATE users SET steam_private=1, last_sync=? WHERE id=?').bind(now, user.id).run();
    return { private: true, count: 0 };
  }

  const stmts = [env.DB.prepare('DELETE FROM library WHERE user_id=?').bind(user.id)];
  const ins = env.DB.prepare('INSERT INTO library (user_id, appid, minutes, minutes_2w) VALUES (?, ?, ?, ?)');
  const gIns = env.DB.prepare(
    `INSERT INTO games (appid, name) VALUES (?, ?)
     ON CONFLICT(appid) DO UPDATE SET name=excluded.name WHERE games.name IS NULL`
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

/* ------------------------------------------------------------------ store info (bulk, via IStoreBrowseService/GetItems) */

async function tagNames() {
  const cache = caches.default;
  const key = new Request('https://cache.burrito.local/steam-tags');
  const hit = await cache.match(key);
  if (hit) return hit.json();
  const r = await fetch(`${STEAM_API}/IStoreService/GetTagList/v1/?language=english`);
  if (!r.ok) return {};
  const d = await r.json();
  const map = {};
  for (const t of (d.response && d.response.tags) || []) map[t.tagid] = t.name;
  await cache.put(key, new Response(JSON.stringify(map), { headers: { 'Cache-Control': 'public, max-age=86400' } }));
  return map;
}

async function getItems(appids, cc, full) {
  const input = {
    ids: appids.map(appid => ({ appid })),
    context: { language: 'english', country_code: CC_UPPER[cc], steam_realm: 1 },
    data_request: full ? { include_basic_info: true, include_tag_count: 20, include_assets: true, include_reviews: true } : {},
  };
  const r = await fetch(`${STEAM_API}/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`);
  if (!r.ok) throw new Error('GetItems ' + r.status);
  const d = await r.json();
  return (d.response && d.response.store_items) || [];
}

function priceOf(it) {
  const bp = it && it.best_purchase_option;
  if (!bp || bp.final_price_in_cents == null) return null;
  const final = +bp.final_price_in_cents;
  return { final, initial: +(bp.original_price_in_cents || final), discount: bp.discount_pct || 0 };
}

function parseItem(it, names) {
  const c = it.categories || {};
  const cats = [...(c.supported_player_categoryids || []), ...(c.feature_categoryids || [])];
  const tags = (it.tags && it.tags.length ? it.tags : (it.tagids || []).map(tagid => ({ tagid, weight: 0 })))
    .slice().sort((a, b) => (b.weight || 0) - (a.weight || 0))
    .map(t => names[t.tagid]).filter(Boolean);
  const has = set => tags.some(t => set.has(t));
  const coop = cats.some(x => COOP_CATS.has(x)) || has(COOP_TAGS);
  const pvp = cats.some(x => PVP_CATS.has(x)) || has(PVP_TAGS);
  const multi = coop || pvp || cats.some(x => MULTI_CATS.has(x)) || has(MULTI_TAGS);
  const workshop = cats.includes(30); // Steam Workshop
  const modded = workshop || tags.includes('Moddable') || tags.includes('Mod');
  const a = it.assets || {};
  const header = a.asset_url_format && a.header
    ? `https://shared.akamai.steamstatic.com/store_item_assets/${a.asset_url_format.replace('${FILENAME}', a.header)}` : null;
  const rv = it.reviews && (it.reviews.summary_filtered || it.reviews.summary_language_specific);
  return {
    appid: it.appid || it.id, name: it.name || null, is_free: !!it.is_free, coop, pvp, multi, modded, workshop,
    tags: tags.filter(t => t !== 'Moddable' && t !== 'Mod').slice(0, 6),
    description: cleanText(it.basic_info && it.basic_info.short_description), header,
    review_score: rv && rv.review_count ? rv.review_score : null,
    review_pct: rv && rv.review_count ? rv.percent_positive : null,
    review_count: rv ? rv.review_count || 0 : null,
  };
}

// Fetch store info + IE/GB/US prices for up to `limit` appids, 100 per request.
async function refreshMeta(env, appids) {
  if (!appids.length) return 0;
  const names = await tagNames();
  const now = Date.now();
  let done = 0;
  for (let i = 0; i < appids.length; i += 100) {
    const chunk = appids.slice(i, i + 100);
    const [ie, gb, us] = await Promise.all([getItems(chunk, 'ie', true), getItems(chunk, 'gb', false), getItems(chunk, 'us', false)]);
    const byId = list => Object.fromEntries(list.map(x => [x.appid || x.id, x]));
    const G = byId(gb), U = byId(us), seen = new Set();
    const stmts = [];
    for (const it of ie) {
      const id = it.appid || it.id;
      seen.add(id);
      if (it.success !== 1 || !it.name) {
        stmts.push(env.DB.prepare('INSERT INTO games (appid, meta_at) VALUES (?, ?) ON CONFLICT(appid) DO UPDATE SET meta_at=excluded.meta_at').bind(id, now));
        continue;
      }
      const g = parseItem(it, names);
      const prices = { ie: priceOf(it), gb: priceOf(G[id]), us: priceOf(U[id]) };
      stmts.push(env.DB.prepare(
        `INSERT INTO games (appid, name, is_free, coop, pvp, multi, genres, description, prices, meta_at, header, review_score, review_pct, review_count, modded, workshop)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(appid) DO UPDATE SET name=excluded.name, is_free=excluded.is_free, coop=excluded.coop, pvp=excluded.pvp,
           multi=excluded.multi, genres=excluded.genres, description=excluded.description, prices=excluded.prices, meta_at=excluded.meta_at,
           header=excluded.header, review_score=excluded.review_score, review_pct=excluded.review_pct, review_count=excluded.review_count,
           modded=excluded.modded, workshop=excluded.workshop`
      ).bind(id, g.name, g.is_free ? 1 : 0, g.coop ? 1 : 0, g.pvp ? 1 : 0, g.multi ? 1 : 0, JSON.stringify(g.tags), g.description, JSON.stringify(prices), now,
        g.header, g.review_score, g.review_pct, g.review_count, g.modded ? 1 : 0, g.workshop ? 1 : 0));
      done++;
    }
    for (const id of chunk) if (!seen.has(id)) {
      stmts.push(env.DB.prepare('INSERT INTO games (appid, meta_at) VALUES (?, ?) ON CONFLICT(appid) DO UPDATE SET meta_at=excluded.meta_at').bind(id, now));
    }
    if (stmts.length) await env.DB.batch(stmts);
  }
  return done;
}

// Library games with missing/old info, most-owned first.
async function fillLibraryMeta(env, limit = 600) {
  const need = (await env.DB.prepare(
    `SELECT l.appid, COUNT(*) AS owners FROM library l LEFT JOIN games g ON g.appid = l.appid
     WHERE g.meta_at IS NULL OR g.meta_at < ? GROUP BY l.appid ORDER BY owners DESC LIMIT ?`
  ).bind(Date.now() - META_MAX_AGE, limit).all()).results.map(r => r.appid);
  return refreshMeta(env, need);
}

/* ------------------------------------------------------------------ discovery charts */

async function storeSearchList(query) {
  const r = await fetch(`${STORE}/search/results/?${query}&json=1&count=100&cc=ie&l=english&category1=998`);
  if (!r.ok) return [];
  const d = await r.json().catch(() => ({}));
  const out = [], seen = new Set();
  for (const it of d.items || []) {
    const m = String(it.logo || '').match(/\/steam\/apps\/(\d+)\//);
    if (m && !seen.has(+m[1])) { seen.add(+m[1]); out.push({ appid: +m[1], value: null }); }
  }
  return out;
}

async function refreshCharts(env) {
  const now = Date.now();
  const lists = {};
  try {
    const r = await fetch(`${STEAM_API}/ISteamChartsService/GetMostPlayedGames/v1/`);
    const d = r.ok ? await r.json() : {};
    lists.played = ((d.response && d.response.ranks) || []).map(x => ({ appid: x.appid, value: x.peak_in_game }));
  } catch (e) { console.error('most played', e); }
  for (const [kind, q] of [['seller', 'filter=topsellers'], ['popularnew', 'filter=popularnew'], ['sale', 'specials=1&filter=topsellers']]) {
    try { lists[kind] = await storeSearchList(q); } catch (e) { console.error('chart', kind, e); }
  }
  const stmts = [];
  const all = new Set();
  for (const [kind, rows] of Object.entries(lists)) {
    if (!rows || !rows.length) continue; // keep yesterday's list if a fetch failed
    stmts.push(env.DB.prepare('DELETE FROM charts WHERE kind=?').bind(kind));
    rows.slice(0, 100).forEach((row, i) => {
      all.add(row.appid);
      stmts.push(env.DB.prepare('INSERT INTO charts (kind, rank, appid, value, fetched_at) VALUES (?, ?, ?, ?, ?)').bind(kind, i + 1, row.appid, row.value, now));
    });
  }
  if (stmts.length) await env.DB.batch(stmts);
  const stale = (await env.DB.prepare(
    'SELECT DISTINCT c.appid FROM charts c LEFT JOIN games g ON g.appid = c.appid WHERE g.meta_at IS NULL OR g.meta_at < ?'
  ).bind(now - 86400e3).all()).results.map(r => r.appid);
  await refreshMeta(env, stale);
}

async function discovery(env) {
  let rows = (await env.DB.prepare('SELECT kind, rank, appid, value, fetched_at FROM charts ORDER BY kind, rank').all()).results;
  if (!rows.length) {
    await refreshCharts(env);
    rows = (await env.DB.prepare('SELECT kind, rank, appid, value, fetched_at FROM charts ORDER BY kind, rank').all()).results;
  }
  const games = (await env.DB.prepare('SELECT * FROM games WHERE appid IN (SELECT appid FROM charts)').all()).results;
  const charts = {};
  for (const r of rows) (charts[r.kind] = charts[r.kind] || []).push({ appid: r.appid, rank: r.rank, value: r.value });
  return json({
    charts,
    games: Object.fromEntries(games.filter(g => g.name).map(g => [g.appid, shapeGame(g, true)])),
    updated: rows.reduce((a, r) => Math.max(a, r.fetched_at || 0), 0),
  });
}

/* ------------------------------------------------------------------ crew + search */

function shapeGame(g, withDesc) {
  return {
    name: g.name, is_free: !!g.is_free, coop: !!g.coop, pvp: !!g.pvp, multi: !!g.multi,
    max_players: g.max_players, tags: g.genres ? JSON.parse(g.genres) : [],
    prices: g.prices ? JSON.parse(g.prices) : null, meta_at: g.meta_at,
    img: g.header || null, modded: !!g.modded, workshop: !!g.workshop,
    review: g.review_score ? { score: g.review_score, pct: g.review_pct, count: g.review_count } : null,
    ...(withDesc ? { description: g.description || '' } : {}),
  };
}

let lastLazyFill = 0;
async function crew(env, ctx) {
  const [users, lib, games, missing] = await Promise.all([
    env.DB.prepare('SELECT id, name, avatar, steam_id, steam_private, game_count, last_sync FROM users ORDER BY name COLLATE NOCASE').all(),
    env.DB.prepare('SELECT l.user_id, l.appid, l.minutes, l.minutes_2w FROM library l WHERE NOT EXISTS (SELECT 1 FROM hidden_games h WHERE h.user_id = l.user_id AND h.appid = l.appid)').all(),
    env.DB.prepare('SELECT * FROM games WHERE appid IN (SELECT DISTINCT appid FROM library)').all(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM games g WHERE g.meta_at IS NULL AND g.appid IN (SELECT appid FROM library)').first(),
  ]);
  // Libraries synced before this version have no store info yet: fill it in the background.
  if (missing && missing.n > 0 && Date.now() - lastLazyFill > 60_000) {
    lastLazyFill = Date.now();
    ctx.waitUntil(fillLibraryMeta(env).catch(e => console.error('lazy meta', e)));
  }
  const library = {};
  for (const r of lib.results) (library[r.user_id] = library[r.user_id] || {})[r.appid] = [r.minutes, r.minutes_2w];
  return json({
    users: users.results.map(u => ({
      id: u.id, name: u.name, avatar: u.avatar, steam_id: !!u.steam_id,
      steam_private: !!u.steam_private, game_count: u.game_count, last_sync: u.last_sync,
    })),
    library,
    games: Object.fromEntries(games.results.map(g => [g.appid, shapeGame(g, false)])),
    pending_info: missing ? missing.n : 0,
  });
}

async function search(env, ctx, url) {
  const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
  if (q.length < 2) return json({ results: [] });
  const cache = caches.default;
  const key = new Request(`https://cache.burrito.local/search/${encodeURIComponent(q.toLowerCase())}`);
  let items = null;
  const hit = await cache.match(key);
  if (hit) items = await hit.json();
  else {
    const r = await fetch(`${STORE}/api/storesearch/?term=${encodeURIComponent(q)}&cc=ie&l=english`);
    const d = r.ok ? await r.json() : {};
    items = (d.items || []).filter(x => x.type === 'app').map(x => ({ appid: x.id, name: x.name }));
    ctx.waitUntil(cache.put(key, new Response(JSON.stringify(items), { headers: { 'Cache-Control': 'public, max-age=3600' } })));
  }
  const ids = items.map(x => x.appid);
  const known = {};
  for (const id of ids) {
    const g = await env.DB.prepare('SELECT * FROM games WHERE appid=?').bind(id).first();
    if (g && g.name && g.meta_at) known[id] = shapeGame(g, true);
  }
  const unknown = ids.filter(id => !known[id]);
  if (unknown.length) {
    await refreshMeta(env, unknown);
    for (const id of unknown) {
      const g = await env.DB.prepare('SELECT * FROM games WHERE appid=?').bind(id).first();
      if (g && g.name) known[id] = shapeGame(g, true);
    }
  }
  return json({ results: items.filter(x => known[x.appid]).map(x => x.appid), games: known });
}

/* ------------------------------------------------------------------ profiles */

async function profile(env, ctx, viewer, id) {
  const u = await getUser(env, id);
  if (!u) return json({ error: 'not_found' }, 404);
  const self = viewer.id === id;
  const rows = (await env.DB.prepare(
    `SELECT l.appid, l.minutes, l.minutes_2w, g.name, g.genres, g.is_free, g.coop, g.pvp, g.multi, g.prices, g.header, g.modded, g.review_score,
            (h.appid IS NOT NULL) AS hidden
     FROM library l LEFT JOIN games g ON g.appid = l.appid
     LEFT JOIN hidden_games h ON h.user_id = l.user_id AND h.appid = l.appid
     WHERE l.user_id = ? ORDER BY l.minutes DESC`
  ).bind(id).all()).results;
  const lib = rows.filter(r => self || !r.hidden);
  const snaps = (await env.DB.prepare('SELECT day, minutes, minutes_2w, games FROM snapshots WHERE user_id=? ORDER BY day DESC LIMIT 90').bind(id).all()).results.reverse();
  const top = lib.filter(r => !r.hidden && r.minutes > 0).slice(0, 6).map(r => r.appid);
  const extras = u.steam_id && !u.steam_private ? await steamExtras(env, ctx, u.steam_id, top) : null;
  return json({
    self,
    user: { id: u.id, name: u.name, avatar: u.avatar, steam_linked: !!u.steam_id, steam_private: !!u.steam_private, last_sync: u.last_sync, game_count: u.game_count },
    steam_id: self ? u.steam_id : undefined,
    library: lib.map(r => {
      const pr = r.prices ? JSON.parse(r.prices) : {};
      return {
        appid: r.appid, name: r.name, minutes: r.minutes, minutes_2w: r.minutes_2w, tags: r.genres ? JSON.parse(r.genres) : [],
        multi: !!(r.multi || r.coop || r.pvp), free: !!r.is_free, modded: !!r.modded, img: r.header || null, review_score: r.review_score,
        price: { ie: pr.ie ? pr.ie.initial : null, gb: pr.gb ? pr.gb.initial : null, us: pr.us ? pr.us.initial : null },
        ...(self ? { hidden: !!r.hidden } : {}),
      };
    }),
    snapshots: snaps,
    extras,
  });
}

async function steamExtras(env, ctx, sid, appids) {
  const cache = caches.default;
  const key = new Request(`https://cache.burrito.local/extras/${sid}/${appids.join(',')}`);
  const hit = await cache.match(key);
  if (hit) return hit.json();
  const k = env.STEAM_API_KEY;
  const out = { summary: null, level: null, achievements: [], stats: [] };
  const get = async u => { try { const r = await fetch(u); return r.ok ? await r.json() : null; } catch { return null; } };
  const [sum, lvl] = await Promise.all([
    get(`${STEAM_API}/ISteamUser/GetPlayerSummaries/v2/?key=${k}&steamids=${sid}`),
    get(`${STEAM_API}/IPlayerService/GetSteamLevel/v1/?key=${k}&steamid=${sid}`),
  ]);
  const pl = sum && sum.response && sum.response.players && sum.response.players[0];
  if (pl) out.summary = { persona: pl.personaname, url: pl.profileurl, avatar: pl.avatarfull, created: pl.timecreated ? pl.timecreated * 1000 : null, country: pl.loccountrycode || null };
  if (lvl && lvl.response && lvl.response.player_level != null) out.level = lvl.response.player_level;
  await Promise.all(appids.map(async appid => {
    const d = await get(`${STEAM_API}/ISteamUserStats/GetPlayerAchievements/v1/?key=${k}&steamid=${sid}&appid=${appid}`);
    const a = d && d.playerstats && d.playerstats.achievements;
    if (Array.isArray(a) && a.length) out.achievements.push({ appid, achieved: a.filter(x => x.achieved).length, total: a.length });
  }));
  await Promise.all(appids.slice(0, 3).map(async appid => {
    const d = await get(`${STEAM_API}/ISteamUserStats/GetUserStatsForGame/v2/?key=${k}&steamid=${sid}&appid=${appid}`);
    const st = d && d.playerstats && d.playerstats.stats;
    if (Array.isArray(st) && st.length) out.stats.push({ appid, stats: pickStats(st) });
  }));
  ctx.waitUntil(cache.put(key, new Response(JSON.stringify(out), { headers: { 'Cache-Control': 'public, max-age=21600' } })));
  return out;
}

// Keep the in-game stats people actually care about (kills, wins, time...), max 8
function pickStats(stats) {
  const score = n => /kill|death|win|mvp|headshot|match|round|time_played|damage|score|assist|played|contract|wave|level|distance/i.test(n) ? 2 : 0;
  return stats.filter(s => typeof s.value === 'number' && s.value > 0 && !/^(last_|gi\.|stat_)/i.test(s.name))
    .sort((a, b) => score(b.name) - score(a.name)).slice(0, 8).map(s => ({ name: s.name, value: s.value }));
}

async function setHidden(req, env, user) {
  const b = await req.json().catch(() => ({}));
  const appid = parseInt(b.appid, 10);
  if (!appid) return json({ error: 'bad_request' }, 400);
  if (b.hidden) await env.DB.prepare('INSERT OR IGNORE INTO hidden_games (user_id, appid) VALUES (?, ?)').bind(user.id, appid).run();
  else await env.DB.prepare('DELETE FROM hidden_games WHERE user_id=? AND appid=?').bind(user.id, appid).run();
  return json({ ok: true, hidden: !!b.hidden });
}

/* ------------------------------------------------------------------ pitches + Discord */

async function listPitches(env) {
  const [p, v, g] = await Promise.all([
    env.DB.prepare('SELECT * FROM pitches ORDER BY created_at DESC LIMIT 200').all(),
    env.DB.prepare('SELECT pitch_id, user_id FROM votes').all(),
    env.DB.prepare('SELECT * FROM games WHERE appid IN (SELECT appid FROM pitches)').all(),
  ]);
  const votes = {};
  for (const x of v.results) (votes[x.pitch_id] = votes[x.pitch_id] || []).push(x.user_id);
  return json({
    pitches: p.results.map(x => ({
      id: String(x.id), game: x.appid, by: x.by_user, to: JSON.parse(x.to_users || '[]'),
      note: x.note || '', at: x.created_at, votes: votes[x.id] || [],
    })),
    games: Object.fromEntries(g.results.filter(x => x.name).map(x => [x.appid, shapeGame(x, true)])),
  });
}

async function createPitch(req, env, ctx, user) {
  const b = await req.json().catch(() => ({}));
  const appid = parseInt(b.appid, 10);
  if (!appid) return json({ error: 'bad_request', message: 'Missing game.' }, 400);
  const note = String(b.note || '').trim().slice(0, 300);
  const to = (Array.isArray(b.to) ? b.to : []).map(String).filter(x => /^\d{1,25}$/.test(x)).slice(0, 25);

  let game = await env.DB.prepare('SELECT * FROM games WHERE appid=?').bind(appid).first();
  if (!game || !game.meta_at) { await refreshMeta(env, [appid]); game = await env.DB.prepare('SELECT * FROM games WHERE appid=?').bind(appid).first(); }
  if (!game || !game.name) return json({ error: 'unknown_game', message: "Couldn't find that game on Steam." }, 400);

  const row = await env.DB.prepare('INSERT INTO pitches (appid, by_user, to_users, note, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id')
    .bind(appid, user.id, JSON.stringify(to), note, Date.now()).first();
  await env.DB.prepare('INSERT OR IGNORE INTO votes (pitch_id, user_id) VALUES (?, ?)').bind(row.id, user.id).run();

  const owners = (await env.DB.prepare('SELECT COUNT(*) AS n FROM library WHERE appid=?').bind(appid).first()).n;
  const total = (await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first()).n;
  ctx.waitUntil(postWebhook(env, pitchMessage(env, user, game, to, note, owners, total)));
  return json({ ok: true, id: String(row.id), posted: !!env.DISCORD_WEBHOOK_URL });
}

async function toggleVote(env, user, id) {
  const exists = await env.DB.prepare('SELECT 1 AS x FROM votes WHERE pitch_id=? AND user_id=?').bind(id, user.id).first();
  if (exists) await env.DB.prepare('DELETE FROM votes WHERE pitch_id=? AND user_id=?').bind(id, user.id).run();
  else {
    const p = await env.DB.prepare('SELECT id FROM pitches WHERE id=?').bind(id).first();
    if (!p) return json({ error: 'not_found' }, 404);
    await env.DB.prepare('INSERT INTO votes (pitch_id, user_id) VALUES (?, ?)').bind(id, user.id).run();
  }
  return json({ ok: true, voted: !exists });
}

async function deletePitch(env, user, id) {
  const p = await env.DB.prepare('SELECT by_user FROM pitches WHERE id=?').bind(id).first();
  if (!p) return json({ error: 'not_found' }, 404);
  if (p.by_user !== user.id) return json({ error: 'forbidden', message: 'You can only delete your own pitches.' }, 403);
  await env.DB.batch([env.DB.prepare('DELETE FROM votes WHERE pitch_id=?').bind(id), env.DB.prepare('DELETE FROM pitches WHERE id=?').bind(id)]);
  return json({ ok: true });
}

async function announce(req, env, ctx, user) {
  const b = await req.json().catch(() => ({}));
  const appid = parseInt(b.appid, 10);
  const game = appid && await env.DB.prepare('SELECT * FROM games WHERE appid=?').bind(appid).first();
  if (!game || !game.name) return json({ error: 'unknown_game' }, 400);
  const ids = (Array.isArray(b.players) ? b.players : []).map(String).filter(x => /^\d{1,25}$/.test(x)).slice(0, 30);
  const names = [];
  for (const id of ids) { const u = await env.DB.prepare('SELECT name FROM users WHERE id=?').bind(id).first(); if (u) names.push(u.name); }
  ctx.waitUntil(postWebhook(env, {
    username: 'Game Night',
    content: `🎲 **${esc(user.name)}** rolled tonight's game: **${esc(game.name)}**`,
    allowed_mentions: { parse: [] },
    embeds: [{
      title: game.name, url: `${STORE}/app/${appid}/`, color: 0xF2B532,
      description: cleanText(game.description || '').slice(0, 300) || undefined,
      image: { url: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg` },
      fields: names.length ? [{ name: "Who's on", value: names.join(', ').slice(0, 1000) }] : undefined,
      footer: { text: (env.FRONTEND_URL || '').replace(/^https?:\/\//, '') },
    }],
  }));
  return json({ ok: true, posted: !!env.DISCORD_WEBHOOK_URL });
}

function pitchMessage(env, user, game, to, note, owners, total) {
  const prices = game.prices ? JSON.parse(game.prices) : {};
  const fmt = (p, sym) => p ? `${sym}${(p.final / 100).toFixed(2)}${p.discount ? ` (-${p.discount}%)` : ''}` : null;
  const priceText = game.is_free ? 'Free' : [fmt(prices.ie, '€'), fmt(prices.gb, '£'), fmt(prices.us, '$')].filter(Boolean).join(' · ') || '—';
  return {
    username: 'Game Night',
    content: `${to.map(id => `<@${id}>`).join(' ')} **${esc(user.name)}** pitched a game 👀`.trim(),
    allowed_mentions: { users: to },
    embeds: [{
      author: { name: user.name, icon_url: user.avatar || undefined },
      title: game.name, url: `${STORE}/app/${game.appid}/`, color: 0xC8321F,
      description: note || cleanText(game.description || '').slice(0, 300) || undefined,
      image: { url: `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/header.jpg` },
      fields: [
        { name: 'Steam price', value: priceText, inline: true },
        { name: 'Crew owns it', value: `${owners}/${total}`, inline: true },
      ],
      footer: { text: `Vote on ${(env.FRONTEND_URL || '').replace(/^https?:\/\//, '')}` },
    }],
  };
}

async function postWebhook(env, payload) {
  if (!env.DISCORD_WEBHOOK_URL) return;
  try {
    const r = await fetch(env.DISCORD_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!r.ok) console.error('webhook', r.status, await r.text());
  } catch (e) { console.error('webhook', e); }
}

/* ------------------------------------------------------------------ game details (trailer, description) */

async function gameDetails(env, ctx, appid, cc) {
  if (!CC_LIST.includes(cc)) cc = 'ie';
  const cache = caches.default;
  const key = new Request(`https://cache.burrito.local/game/${appid}/${cc}`);
  const hit = await cache.match(key);
  if (hit) return hit;

  const r = await fetch(`${STORE}/api/appdetails?appids=${appid}&cc=${cc}&l=english`);
  if (!r.ok) return json({ error: 'store_error' }, 502);
  const entry = (await r.json())[appid];
  if (!entry || !entry.success) return json({ error: 'not_found' }, 404);

  const known = await env.DB.prepare('SELECT meta_at FROM games WHERE appid=?').bind(appid).first();
  if (!known || !known.meta_at) ctx.waitUntil(refreshMeta(env, [appid]).catch(e => console.error('meta on details', e)));
  const res = json(shapeDetails(appid, entry.data), 200, { 'Cache-Control': 'public, max-age=43200' });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

function shapeDetails(appid, a) {
  return {
    appid, name: a.name,
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

/* ------------------------------------------------------------------ hourly job */

async function hourly(env) {
  const now = Date.now();

  // 1. Re-sync libraries older than 20 hours (a few per run, inside free-plan limits)
  const stale = (await env.DB.prepare(
    'SELECT * FROM users WHERE steam_id IS NOT NULL AND (last_sync IS NULL OR last_sync < ?) ORDER BY last_sync LIMIT 4'
  ).bind(now - 20 * 3600e3).all()).results;
  for (const u of stale) {
    try { await syncSteam(env, u); } catch (e) { console.error('sync', u.id, e); }
  }

  // 2. Store info for library games (300 per run = 9 requests)
  try { await fillLibraryMeta(env, 300); } catch (e) { console.error('library meta', e); }

  // 3. Discovery charts, once a day
  const last = await env.DB.prepare('SELECT MAX(fetched_at) AS t FROM charts').first();
  if (!last || !last.t || now - last.t > CHART_MAX_AGE) {
    try { await refreshCharts(env); } catch (e) { console.error('charts', e); }
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
    .replace(/\s+/g, ' ').trim();
}

// Escape Discord markdown in names
const esc = s => String(s || '').replace(/([*_~`|>\\])/g, '\\$1');

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
