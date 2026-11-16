(async () => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const store = {
    get(k, d) { try { const v = localStorage.getItem('bg:' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('bg:' + k, JSON.stringify(v)); } catch {} },
  };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CFG = window.BG_CONFIG || {};
  const API = window.BG_API || { live: false };

  $('#burrito').innerHTML = burritoSVG();
  const ready = await (window.BG_READY || Promise.resolve({ mode: 'mock' }));
  if (ready.mode === 'gate') { renderGate(ready); return; }

  const D = window.BG_DATA;
  const LIVE = !!D.live;
  const { CREW, GAMES, LIB, ME } = D;
  const crewById = Object.fromEntries(CREW.map(c => [c.id, c]));
  const gameById = Object.fromEntries(GAMES.map(g => [g.id, g]));
  const CORE = LIVE ? [ME] : ['james', 'bradley', 'lukas'];
  const VIEWS = ['tonight', 'shuffle', 'discovery', 'pitches', 'news', 'leaderboard', 'profile'];
  const SYM = { EUR: '€', GBP: '£', USD: '$' };
  const CC = { EUR: 'ie', GBP: 'gb', USD: 'us' };
  const firstOther = (CREW.find(c => c.id !== ME && !c.private) || {}).id;

  const savedOn = store.get(LIVE ? 'on-live' : 'on', CORE).filter(id => crewById[id]);
  const state = {
    view: 'tonight',
    on: new Set(savedOn.length ? savedOn : CORE),
    tf: { single: false, coop: false, pvp: false, modded: false, small: false, fits: false, cap: 0 },
    sh: Object.assign({ pool: 'all', coop: false, pvp: false, free: false, fits: true, modded: false, single: false, small: false, cap: 0 }, store.get('shuffle', {})),
    hidden: new Set(), history: [], current: null, rolling: false,
    pitches: LIVE ? [] : store.get('pitches', D.PITCHES || []),
    statPick: {}, gstats: {}, gstatsLoading: {},
    query: '', lb: 'recent', lbView: 'rank', cmp: [ME, firstOther],
    cur: store.get('cur', 'EUR'),
    disc: { src: 'played', unowned: true, single: false, modded: false, small: false, cap: 0 },
    news: null, newsMine: false, newsPatch: false, gameNews: {},
    profileId: null, profiles: {}, libQuery: '', libFilter: 'all', libShow: 60,
  };
  let draft = null, confirmUnlink = false;
  state.presence = {};
  async function loadPresence() {
    if (!LIVE) {
      // fake-data mode: a couple of people "online"
      state.presence = { bradley: { s: 1, g: 'Counter-Strike 2', gid: 730 }, conor: { s: 1, g: null }, dee: { s: 3, g: null } };
    } else {
      if (document.hidden) return;
      try { state.presence = (await API.call('/api/presence')).presence || {}; } catch { return; }
    }
    renderCrew();
  }
  const isOnline = id => { const p = state.presence[id]; return p && (p.s > 0 || p.g); };
  function mergeGames(map) {
    Object.entries(map || {}).forEach(([key, raw]) => {
      const id = +key;
      if (gameById[id]) { if (raw.description && !gameById[id].desc) gameById[id].desc = raw.description; return; }
      const g = API.normaliseGame(id, raw);
      g.disc = !CREW.some(c => owns(c.id, id));
      GAMES.push(g); gameById[id] = g;
    });
  }

  /* ---------- helpers ---------- */
  const people = () => [...state.on];
  const owns = (pid, gid) => !!(LIB[pid] && LIB[pid][gid]);
  const hrs = (pid, gid) => (LIB[pid] && LIB[pid][gid] ? LIB[pid][gid].h : 0);
  const ownCount = g => CREW.filter(c => owns(c.id, g.id)).length;
  const names = ids => ids.map(i => crewById[i].name).join(', ');
  const isMulti = g => g.coop || g.pvp || g.multi || g.known === false; // unknown = not yet fetched from Steam
  const knownSingle = g => g.known !== false && !(g.coop || g.pvp || g.multi);

  function status(g, ppl = people()) {
    const known = ppl.filter(p => !crewById[p].private);
    const owners = known.filter(p => owns(p, g.id));
    const missing = g.f2p ? [] : known.filter(p => !owns(p, g.id));
    const unknown = ppl.filter(p => crewById[p].private);
    const groupH = owners.reduce((a, p) => a + hrs(p, g.id), 0);
    const fits = !g.max || ppl.length <= g.max;
    return { owners, missing, unknown, groupH, fits };
  }

  const img = g => g.img || `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.id}/header.jpg`;
  // Newer Steam games keep art under hashed URLs; try the common alternatives before giving up
  window.bgImgFail = el => {
    const id = el.dataset.id, t = +(el.dataset.t || 0);
    const alts = [
      `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${id}/header.jpg`,
      `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/capsule_616x353.jpg`,
      `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${id}/capsule_616x353.jpg`,
    ].filter(u => u !== el.src);
    if (t < alts.length) { el.dataset.t = t + 1; el.src = alts[t]; }
    else el.parentNode.classList.add('noimg');
  };
  const storeUrl = g => `https://store.steampowered.com/app/${g.id}/`;
  const ggUrl = g => g.ggUrl || `https://gg.deals/steam/app/${g.id}/`;
  const money = v => SYM[state.cur] + v.toFixed(2);
  const P = g => (g.prices && g.prices[state.cur]) || { base: 0, steam: 0, key: null };
  const hasPrice = g => g.f2p || P(g).steam > 0;
  const price = g => g.f2p ? 'Free' : hasPrice(g) ? money(P(g).steam) : '—';
  // Cheapest way to get it: Steam price or keyshop, whichever is lower
  const cheapest = g => { if (g.f2p) return 0; const p = P(g), opts = [p.steam > 0 ? p.steam : null, p.key > 0 ? p.key : null].filter(v => v != null); return opts.length ? Math.min(...opts) : null; };
  const underCap = (g, cap) => !cap || g.f2p || (cheapest(g) != null && cheapest(g) < cap);
  const CAPS = [5, 10, 20];
  const capBtns = (scope, cur) => CAPS.map(c => `<button class="toggle ${cur === c ? 'on' : ''}" data-cap="${scope}:${c}">Under ${SYM[state.cur]}${c}</button>`).join('');
  const fmt = n => (Math.round(n * 10) / 10).toLocaleString();
  const sizeTxt = mb => mb >= 1048576 ? (Math.round(mb / 104857.6) / 10) + ' TB' : mb >= 1024 ? (mb >= 10240 ? Math.round(mb / 1024) : Math.round(mb / 102.4) / 10) + ' GB' : mb + ' MB';
  const SMALL_MB = 20 * 1024;
  const small = g => g.size && g.size <= SMALL_MB;
  function since(ts) {
    if (!ts) return 'never';
    const d = (Date.now() - ts) / 864e5;
    if (d < 1) return 'today'; if (d < 2) return 'yesterday'; if (d < 14) return Math.floor(d) + ' days ago';
    if (d < 60) return Math.floor(d / 7) + ' weeks ago'; if (d < 365) return Math.floor(d / 30) + ' months ago';
    const y = d / 365; return (y < 2 ? Math.floor(d / 30) + ' months' : Math.floor(y) + ' years') + ' ago';
  }

  function priceBlock(g) {
    if (g.f2p) return `<div class="prices"><span class="p-steam"><small>Steam</small><b>Free</b></span></div>`;
    if (!hasPrice(g)) return `<div class="prices"><span class="p-steam"><small>Steam</small><b>—</b></span><a class="p-keys" href="${ggUrl(g)}" target="_blank" rel="noopener"><small>Compare</small> ↗</a></div>`;
    const p = P(g), steamBest = !p.key || p.steam <= p.key;
    return `<div class="prices">
      <span class="p-steam ${p.key && steamBest ? 'best' : ''}"><small>Steam</small>${g.sale ? `<s>${money(p.base)}</s>` : ''}<b>${money(p.steam)}</b>${g.sale ? `<em>-${g.sale}%</em>` : ''}</span>
      ${p.key ? `<a class="p-keys ${steamBest ? '' : 'best'}" href="${ggUrl(g)}" target="_blank" rel="noopener" title="Cheapest keyshop (Loaded, G2A, etc.) via GG.deals"><small>Keys from</small><b>${money(p.key)}</b> ↗</a>`
              : `<a class="p-keys" href="${ggUrl(g)}" target="_blank" rel="noopener" title="Compare keyshop prices on GG.deals"><small>Keyshops</small> ↗</a>`}
    </div>`;
  }

  function av(pid, cls = '') {
    const c = crewById[pid];
    if (c.avatar) return `<img class="av ${cls}" src="${esc(c.avatar)}" alt="" title="${esc(c.name)}" style="background:${c.color}" onerror="this.removeAttribute('src')">`;
    return `<span class="av ${cls}" style="background:${c.color}" title="${esc(c.name)}">${esc(c.name[0])}</span>`;
  }
  const art = (g, details = false) => `<div class="art ${details ? 'clickable' : ''}" ${details ? `data-details="${g.id}"` : ''}><img src="${img(g)}" alt="" loading="lazy" data-id="${g.id}" onerror="bgImgFail(this)"><span class="fallback">${esc(g.name)}</span>${details ? '<span class="play">▶</span>' : ''}</div>`;
  const tags = g => `<div class="tags">${g.size ? `<span class="tag sz ${g.size > 60 * 1024 ? 'big' : ''}" title="Install size (from Steam's requirements)">💾 ${sizeTxt(g.size)}</span>` : ''}${g.modded ? '<span class="tag mod" title="Moddable (Steam Workshop / Nexus)">🔧 Modded</span>' : ''}${g.tags.map(t => `<span class="tag ${t === 'Co-op' ? 'coop' : t === 'PvP' ? 'pvp' : ''}">${esc(t)}</span>`).join('')}</div>`;
  const RV = { 9: ['Overwhelmingly Positive', ':D', 'g2'], 8: ['Very Positive', ':)', 'g1'], 7: ['Positive', ':)', 'g1'], 6: ['Mostly Positive', ':)', 'g1'],
    5: ['Mixed', ':|', 'mid'], 4: ['Mostly Negative', ':(', 'b1'], 3: ['Negative', ':(', 'b1'], 2: ['Very Negative', ':(', 'b1'], 1: ['Overwhelmingly Negative', '>:(', 'b2'] };
  const compact = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n);
  function review(g) {
    const r = g.review; if (!r || !RV[r.score]) return '';
    const [label, face, cls] = RV[r.score];
    return `<span class="rv ${cls}" title="Steam reviews: ${label} · ${r.pct}% of ${compact(r.count || 0)}">${face}</span>`;
  }
  const pitchedSet = () => new Set(state.pitches.map(p => +p.game));
  const pitchBtn = (g, cls = 'btn sm ghost') => pitchedSet().has(+g.id)
    ? `<button class="${cls} pitched" data-view="pitches" title="Already on the shortlist. Go vote!">Pitched ✓</button>`
    : `<button class="${cls}" data-pitch="${g.id}">Pitch it</button>`;
  const title = (g, tag = 'h4') => `<div class="ttl"><${tag}>${esc(g.name)}</${tag}>${review(g)}</div>`;
  const playersTxt = g => g.max ? `👥 up to ${g.max}` : (g.coop || g.pvp || g.multi) ? '👥 multiplayer' : g.known === false ? '👥 checking Steam…' : '👤 single-player';
  const needsHtml = s => `<div class="needs"><b>Needs:</b> ${s.missing.map(p => av(p, 'sm') + ' ' + esc(crewById[p].name)).join(' ')}</div>`;
  const unknownHtml = s => s.unknown.length ? `<div class="unknown">? ${esc(names(s.unknown))}: Steam private / not linked</div>` : '';
  function ago(ts) {
    const m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return 'just now'; if (m < 60) return m + 'm ago';
    const h = Math.round(m / 60); if (h < 24) return h + 'h ago';
    return Math.round(h / 24) + 'd ago';
  }

  let toastT;
  function toast(html) {
    const t = $('#toast'); t.innerHTML = html; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3000);
  }

  function burritoSVG() {
    const map = [
      '...kkkkkk...', '..kGRGGRGk..', '.kGGRGGGRGk.', '.kTTTTTTTTk.', '.kTtTTTtTTk.',
      '.kTTTTTTTTk.', '.kTTtTTTtTk.', '.kFFFFFFFFk.', '.kFfFFfFFFk.', '.kFFFfFFfFk.',
      '.kFfFFFFfFk.', '..kFFFFFFk..', '...kkkkkk...',
    ];
    const col = { G: '#4C9A3B', R: '#C8321F', T: '#E9C27D', t: '#C99A4E', F: '#D3D8DB', f: '#98A2A8', k: '#24160F' };
    let rects = '';
    map.forEach((row, y) => [...row].forEach((ch, x) => { if (col[ch]) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${col[ch]}"/>`; }));
    return `<svg viewBox="0 0 ${map[0].length} ${map.length}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
  }

  /* ---------- login gate (live mode, not logged in) ---------- */
  function renderGate(r) {
    ['#crewPanel', '.tabs', '#cur', '.mockbar'].forEach(s => { const el = $(s); if (el) el.hidden = true; });
    const msg = {
      login: ['Members only', 'Log in with Discord so we can check you’re in the Burrito Gang server.'],
      not_member: ['Not in the Discord yet', 'This site is for Burrito Gang members. Join the server, then log in again.'],
      missing_role: ['Missing role', 'You’re in the server but don’t have the role this site needs. Give a mod a shout.'],
      state: ['Login timed out', 'That login took too long. Give it another go.'],
      denied: ['Login cancelled', 'You cancelled the Discord login.'],
      error: ['Something broke', r.message || 'Try again in a minute.'],
    }[r.reason] || ['Log in', ''];
    $('#view').innerHTML = `<div class="gate"><div class="gate-card">
      <div class="gate-burrito">${burritoSVG()}</div>
      <h1>${esc(msg[0])}</h1><p>${esc(msg[1])}</p>
      <div class="gate-actions">
        <a class="btn blurple" href="${esc(API.loginUrl)}">Log in with Discord</a>
        ${r.reason === 'not_member' && CFG.DISCORD_INVITE ? `<a class="btn" href="${esc(CFG.DISCORD_INVITE)}" target="_blank" rel="noopener">Join the Discord</a>` : ''}
      </div></div></div>`;
  }

  /* ---------- Steam link notice (live mode) ---------- */
  function renderNotice() {
    const n = $('#notice');
    if (!LIVE) { n.hidden = true; return; }
    const me = D.me;
    if (!me.steam_id) {
      n.innerHTML = `<div class="notice"><div><b>Link your Steam account</b>
        <p>So your games show up in Common Ground and the leaderboard. Paste your Steam profile link, custom URL name or SteamID64.</p></div>
        <div class="notice-form"><input id="steamInput" placeholder="steamcommunity.com/id/yourname" autocomplete="off"><button class="btn" id="steamLinkBtn">Link Steam</button></div></div>`;
    } else if (me.steam_private) {
      n.innerHTML = `<div class="notice warn"><div><b>Your Steam game details are private</b>
        <p>Set <b>Game details</b> to <b>Public</b> in your <a href="https://steamcommunity.com/my/edit/settings" target="_blank" rel="noopener">Steam privacy settings</a>, then hit resync.</p></div>
        <button class="btn" id="resyncBtn">Resync</button></div>`;
    } else { n.hidden = true; return; }
    n.hidden = false;
  }

  function setMenu(open) {
    $('.top').classList.toggle('menu-open', open);
    document.documentElement.classList.toggle('menu-lock', open);
    $('#menuBtn').setAttribute('aria-expanded', String(open));
    $('#menuBtn').textContent = open ? '✕' : '☰';
  }
  window.addEventListener('resize', () => { if (innerWidth > 980 && $('.top').classList.contains('menu-open')) setMenu(false); });
  function renderTheme() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    $('#themeBtn').textContent = dark ? '☀️' : '🌙';
    $('#themeBtn').title = dark ? 'Switch to light mode' : 'Switch to dark mode';
  }
  function toggleTheme() {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('bg:theme', next); } catch {}
    renderTheme();
  }
  function renderCur() {
    $('#cur').innerHTML = Object.entries(SYM).map(([k, s]) => `<button class="${state.cur === k ? 'on' : ''}" data-cur="${k}" title="${k}">${s}</button>`).join('');
  }

  /* ---------- crew ---------- */
  function renderCrew() {
    const sorted = [...CREW].sort((a, b) => (isOnline(b.id) ? 1 : 0) - (isOnline(a.id) ? 1 : 0));
    $('#crew').innerHTML = sorted.map(c => {
      const p = state.presence[c.id];
      const dot = p && p.g ? '<span class="pdot game" title="In game"></span>' : p && p.s > 0 ? `<span class="pdot ${p.s === 1 ? 'on' : 'away'}" title="${p.s === 1 ? 'Online' : 'Away'}"></span>` : '';
      return `<button class="chip ${state.on.has(c.id) ? 'on' : ''}" data-id="${c.id}"><span class="avwrap">${av(c.id, 'sm')}${dot}</span>${esc(c.name)}${p && p.g ? `<span class="ingame">🎮 ${esc(p.g)}</span>` : ''}${c.private ? `<span class="lock">🔒 ${c.unlinked ? 'no Steam' : 'private'}</span>` : ''}</button>`;
    }).join('');
    const n = CREW.filter(c => isOnline(c.id)).length;
    const btn = $('[data-crew=online]');
    if (btn) { btn.hidden = !n; btn.textContent = `Who's online (${n})`; }
  }

  /* ---------- game details: trailer + description ---------- */
  const detailCache = {};
  function getDetails(g) {
    const fallback = { description: g.desc || '', genres: [], categories: [], movie: null };
    if (!LIVE) return Promise.resolve(fallback);
    const key = g.id + ':' + CC[state.cur];
    if (!detailCache[key]) detailCache[key] = API.call(`/api/game/${g.id}?cc=${CC[state.cur]}`).catch(() => fallback);
    return detailCache[key];
  }
  let hlsP;
  function loadHls() {
    if (window.Hls) return Promise.resolve(window.Hls);
    return hlsP || (hlsP = new Promise(res => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js';
      s.onload = () => res(window.Hls); s.onerror = () => res(null);
      document.head.appendChild(s);
    }));
  }
  function mountVideo(el, m, g) {
    if (!m || !(m.mp4 || m.webm || m.hls)) return;
    const v = document.createElement('video');
    Object.assign(v, { muted: true, autoplay: true, loop: true, playsInline: true, controls: true, poster: m.poster || img(g), className: 'trailer' });
    if (m.mp4 || m.webm) v.src = m.mp4 || m.webm;
    else if (v.canPlayType('application/vnd.apple.mpegurl')) v.src = m.hls;
    else loadHls().then(Hls => { if (Hls && Hls.isSupported()) { const h = new Hls(); h.loadSource(m.hls); h.attachMedia(v); } });
    el.innerHTML = ''; el.appendChild(v);
    v.play().catch(() => {});
  }
  async function hydrate(g, root) {
    if (!root) return;
    const d = await getDetails(g);
    if (!root.isConnected) return;
    const desc = root.querySelector('[data-desc]');
    if (desc) desc.textContent = d.description || g.desc || 'No description available.';
    const st = root.querySelector('[data-stags]');
    if (st) st.innerHTML = [...(d.genres || []), ...(d.categories || [])].filter((t, i, a) => a.indexOf(t) === i && !g.tags.includes(t)).slice(0, 8).map(t => `<span class="tag soft">${esc(t)}</span>`).join('');
    const media = root.querySelector('[data-media]');
    if (media && d.movie) mountVideo(media, d.movie, g);
  }
  const mediaHtml = g => `<div class="media" data-media>${art(g)}${LIVE ? '' : '<span class="media-note">▶ Trailers play once Steam is connected</span>'}</div>`;

  function openDetails(id) {
    const g = gameById[id]; if (!g) return;
    const s = status(g);
    $('#modal').innerHTML = `<div class="sheet wide" role="dialog" aria-label="${esc(g.name)}">${mediaHtml(g)}<div class="in">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px"><div class="ttl"><h2 style="font-size:30px">${esc(g.name)}</h2>${review(g)}</div><button class="linkbtn" data-close>Close ✕</button></div>
      <div class="tagrow">${tags(g)}<span class="tags" data-stags></span></div>
      <p class="desc" data-desc>${esc(g.desc || 'Loading…')}</p>
      <div class="meta"><span>${playersTxt(g)}</span><span>${ownCount(g) ? `${ownCount(g)} of the crew own it` : 'Nobody in the crew owns it'}</span></div>
      ${s.owners.length ? `<div><span class="stack">${s.owners.map(p => av(p, 'sm')).join('')}</span></div>` : ''}
      ${priceBlock(g)}
      ${lastPlayedHtml(g)}
      ${updatedHtml(g)}
      ${g.review && RV[g.review.score] ? `<p class="hint" style="margin:0">Steam reviews: <b>${RV[g.review.score][0]}</b> (${g.review.pct}% of ${compact(g.review.count || 0)})</p>` : ''}
      <div style="display:flex;gap:10px;justify-content:flex-end;align-items:center;flex-wrap:wrap">${modLinks(g)}<a class="btn ghost" href="${storeUrl(g)}" target="_blank" rel="noopener">Steam page ↗</a>${pitchBtn(g, 'btn blurple')}</div>
    </div></div>`;
    $('#modal').hidden = false;
    hydrate(g, $('#modal .sheet'));
    loadGameNews(g, $('#modal .sheet'));
  }

  function lastPlayedHtml(g) {
    // Everyone ticked tonight: do they own it, and when did they last play?
    const tonight = people().map(id => {
      const c = crewById[id], e = LIB[id] && LIB[id][g.id];
      if (c.private) return { c, cls: 'unknown', txt: c.unlinked ? 'no Steam linked' : 'Steam private' };
      if (!e) return { c, cls: 'missing', txt: g.f2p ? 'free to grab' : 'doesn’t own it' };
      const when = e.lp ? `played ${since(e.lp)}` : e.h ? `owns · ${fmt(e.h)}h played` : 'owns · never played';
      return { c, cls: e.lp && Date.now() - e.lp < 7 * 864e5 ? 'fresh' : e.h || e.lp ? 'owns' : 'never', txt: `✓ ${when}`, lp: e.lp || 0 };
    }).sort((a, b) => ['fresh', 'owns', 'never', 'missing', 'unknown'].indexOf(a.cls) - ['fresh', 'owns', 'never', 'missing', 'unknown'].indexOf(b.cls) || b.lp - a.lp);
    const others = CREW.filter(c => !state.on.has(c.id) && LIB[c.id] && LIB[c.id][g.id]);
    if (!tonight.length && !others.length) return '';
    return `<div class="lp">${tonight.length ? `<span class="label">Tonight’s crew</span><div class="lp-list">${tonight.map(o =>
      `<span class="lp-item ${o.cls}">${av(o.c.id, 'sm')} ${esc(o.c.name)} <b>${o.txt}</b></span>`).join('')}</div>` : ''}
      ${others.length ? `<div class="lp-others">Also owned by ${others.map(c => `${av(c.id, 'sm')} ${esc(c.name)}`).join(' ')}</div>` : ''}</div>`;
  }
  function updatedHtml(g) {
    const n = state.gameNews[g.id];
    const lu = (n && n.last_update) || g.lastUpdate, ln = (n && n.last_news) || g.lastNews;
    if (!lu && !ln) return `<div class="upd" data-upd>${LIVE ? '<span class="hint">Checking Steam for recent updates…</span>' : ''}</div>`;
    const days = lu ? (Date.now() - lu) / 864e5 : null;
    const dead = days != null && days > 365 && !g.f2p ? `<span class="dead">💀 No updates in ${since(lu).replace(' ago', '')}. Might be abandoned.</span>` : '';
    const items = n && n.items && n.items.length ? `<ul class="news-mini">${n.items.slice(0, 3).map(x => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener">${x.patch ? '🛠 ' : ''}${esc(x.title)}</a> <span>${since(x.date)}</span></li>`).join('')}</ul>` : '';
    return `<div class="upd" data-upd>${lu ? `<span>🛠 Last updated <b>${since(lu)}</b></span>` : ''}${ln && ln !== lu ? `<span>📰 Last news <b>${since(ln)}</b></span>` : ''}${dead}${items}</div>`;
  }
  async function loadGameNews(g, root) {
    if (!LIVE) {
      const items = (D.NEWS || []).filter(x => x.appid === g.id);
      const lastPatch = Math.max(0, ...items.filter(x => x.patch).map(x => x.date)), lastAny = Math.max(0, ...items.map(x => x.date));
      state.gameNews[g.id] = { items, last_update: Math.max(lastPatch, g.lastUpdate || 0) || null, last_news: Math.max(lastAny, g.lastNews || 0) || null };
    }
    else if (!state.gameNews[g.id]) {
      try { state.gameNews[g.id] = await API.call(`/api/news?appid=${g.id}`); } catch { return; }
    }
    const el = root && root.querySelector('[data-upd]');
    if (el && root.isConnected) el.outerHTML = updatedHtml(g);
  }
  function modLinks(g) {
    if (!g.modded) return '';
    const nexus = `https://www.google.com/search?q=${encodeURIComponent(g.name + ' site:nexusmods.com')}`;
    return `<span class="modlinks">🔧 ${g.workshop ? `<a href="https://steamcommunity.com/app/${g.id}/workshop/" target="_blank" rel="noopener">Workshop</a> · ` : ''}<a href="${nexus}" target="_blank" rel="noopener">Nexus</a></span>`;
  }

  /* ---------- tonight ---------- */
  function renderTonight() {
    const ppl = people(), v = $('#view');
    if (!ppl.length) { v.innerHTML = `<div class="empty">Tick who's on tonight to see what you can play.</div>`; return; }
    const f = state.tf;
    const pass = (g, s) => (f.single ? knownSingle(g) : isMulti(g)) && (!f.coop || g.coop) && (!f.pvp || g.pvp) && (!f.modded || g.modded) && (!f.small || small(g)) && (!f.fits || s.fits) && underCap(g, f.cap);
    const ready = [], almost = [], free = [];
    GAMES.forEach(g => {
      if (g.disc) return;
      const s = status(g, ppl); if (!pass(g, s)) return;
      const item = { g, s };
      if (f.single) { if (s.owners.length) ready.push(item); return; }
      if (g.f2p) { if (s.owners.length) free.push(item); }
      else if (!s.missing.length) { if (s.owners.length || !LIVE) ready.push(item); }
      else if (s.missing.length <= 2 && s.owners.length) almost.push(item);
    });
    ready.sort((a, b) => b.s.groupH - a.s.groupH);
    almost.sort((a, b) => a.s.missing.length - b.s.missing.length || P(a.g).steam - P(b.g).steam);
    free.sort((a, b) => b.s.owners.length - a.s.owners.length || b.s.groupH - a.s.groupH);
    const cap = list => list.slice(0, 48);

    const fl = [['coop', 'Co-op'], ['pvp', 'PvP'], ['modded', '🔧 Modded'], ['small', '💾 Under 20 GB'], ['fits', ppl.length > 1 ? `Fits all ${ppl.length} of us` : 'Fits the group'], ['single', 'Single-player only']];
    const unsized = f.small ? GAMES.filter(g => !g.disc && !g.size && status(g, ppl).owners.length).length : 0;
    const sizeNote = f.small && unsized ? `<p class="hint" style="margin:0 0 12px">💾 Still checking install sizes for ${unsized} of these games. They show up here as Steam answers, a few dozen every few minutes.</p>` : '';
    const pending = sizeNote + (LIVE && D.pendingInfo ? `<p class="hint" style="margin:0 0 12px">⏳ Still fetching Steam info (co-op/PvP, prices) for ${D.pendingInfo} games. Refresh in a minute.</p>` : '');
    v.innerHTML = pending +
      `<div class="filters">${fl.map(([k, l]) => `<button class="toggle ${f[k] ? 'on' : ''}" data-tf="${k}">${l}</button>`).join('')}<span class="fsep"></span>${capBtns('tf', f.cap)}</div>` +
      (f.single ? section('Single-player', cap(ready), ready.length, 'Owned by someone ticked above. For solo nights.', 'ready') :
      section('Everyone owns', cap(ready), ready.length, 'Ready to launch right now.', 'ready') +
      section('Almost', cap(almost), almost.length, 'Only 1 or 2 people need to buy it.', 'almost') +
      section('Free to play', cap(free), free.length, 'Nobody has to spend a cent.', 'free'));
  }
  function section(title, items, total, sub, kind) {
    return `<div class="section-head"><h2>${title}</h2><span class="count">${total}</span><p>${sub}</p></div>` +
      (items.length ? `<div class="grid">${items.map(i => card(i.g, i.s, kind)).join('')}</div>` : `<div class="empty">Nothing here with these filters.</div>`);
  }
  function card(g, s, kind) {
    return `<article class="gcard ${s.fits ? '' : 'dim'}">${art(g, true)}
      <div class="body">${title(g)}${tags(g)}
        <div class="meta"><span>${playersTxt(g)}${s.fits ? '' : ' · too many of you'}</span><span>${s.groupH ? fmt(s.groupH) + 'h together' : ''}</span></div>
        ${kind === 'almost' ? needsHtml(s) + priceBlock(g) : ''}
        ${s.owners.length ? `<div class="meta"><span class="stack">${s.owners.slice(0, 10).map(p => av(p, 'sm')).join('')}</span><span>${kind === 'free' ? s.owners.length + ' have it' : ''}</span></div>` : ''}
        ${unknownHtml(s)}
      </div>
      <div class="actions">${pitchBtn(g)}<a href="${storeUrl(g)}" target="_blank" rel="noopener">Steam ↗</a></div>
    </article>`;
  }

  /* ---------- shuffle ---------- */
  function pool() {
    const ppl = people(), o = state.sh;
    return GAMES.filter(g => {
      if (state.hidden.has(g.id)) return false;
      if (o.pool !== 'shortlist' && (o.single ? !knownSingle(g) : knownSingle(g))) return false;
      if (o.modded && !g.modded) return false;
      if (o.small && !small(g)) return false;
      const s = status(g, ppl);
      const owned = s.owners.length > 0;
      if (o.pool === 'shortlist') { if (!pitchedSet().has(+g.id)) return false; }
      else if (o.pool === 'all' && (s.missing.length || !owned)) return false;
      if (o.pool === 'one' && (s.missing.length > 1 || !owned)) return false;
      if (o.pool === 'none' && (owned || !g.name)) return false;
      if (!underCap(g, o.cap)) return false;
      if (o.coop && !g.coop) return false;
      if (o.pvp && !g.pvp) return false;
      if (o.free && !g.f2p) return false;
      if (o.fits && !s.fits) return false;
      return true;
    });
  }
  function renderShuffle() {
    const p = pool(), o = state.sh, g = state.current && gameById[state.current];
    const pools = [['all', 'Everyone owns'], ['one', 'Missing ≤1'], ['none', 'Nobody owns'], ['shortlist', 'Shortlist'], ['any', 'Anything']];
    if (LIVE && (o.pool === 'none' || o.pool === 'any') && !state.charts) loadCharts().then(() => { if (state.view === 'shuffle') render(); });
    const locks = [['fits', 'Fits everyone on'], ['coop', 'Co-op only'], ['pvp', 'PvP only'], ['free', 'Free only'], ['modded', '🔧 Modded only'], ['small', '💾 Under 20 GB'], ['single', 'Single-player only']];
    $('#view').innerHTML = `<div class="shuffle"><div>
      ${g ? bigCard(g) : `<div class="bigcard"><div class="art noimg"><span class="fallback" style="font-size:40px">🎲</span></div>
        <div class="body"><h2>Can't decide?</h2><p class="desc">Roll a random game from what tonight's crew can play. Lock filters on the right and keep rolling until something sticks. Each roll shows the trailer and what the game's about.</p></div></div>`}
      <div class="roll-actions">
        <button class="btn big" id="rollBtn">ROLL 🎲</button><span>or press <span class="kbd">SPACE</span></span>
        ${g ? `<button class="btn blurple" data-act="yes">👍 We're playing this</button><button class="btn ghost" data-act="nah" title="Hide it for this session">👎 Nah</button>` : ''}
      </div></div>
      <aside class="side">
        <div class="panel"><h3>Pool</h3>
          <div class="seg">${pools.map(([k, l]) => `<button class="${o.pool === k ? 'on' : ''}" data-pool="${k}">${l}</button>`).join('')}</div>${(() => { const blind = people().filter(id => crewById[id].private); return blind.length && o.pool !== 'any' ? `<p class="hint" style="margin:8px 0 0">🔒 Can’t see ${blind.map(id => esc(crewById[id].name)).join(', ')}’s Steam library, so ${blind.length > 1 ? 'they aren’t' : 'they’re not'} counted here.</p>` : ''; })()}
          ${o.pool === 'none' ? '<p class="hint" style="margin:8px 0 0">Games none of tonight’s crew own: Steam’s charts, pitches and games other people have. Good for finding something new.</p>' : ''}
          <div class="poolcount">${p.length} game${p.length === 1 ? '' : 's'} in the pool${state.hidden.size ? ` · ${state.hidden.size} hidden · <button class="linkbtn" data-act="unhide">reset</button>` : ''}</div>
        </div>
        <div class="panel"><h3>Locks</h3><div class="locks">
          ${locks.map(([k, l]) => `<button class="lockrow ${o[k] ? 'on' : ''}" data-sh="${k}">${l}<span>${o[k] ? '🔒' : '🔓'}</span></button>`).join('')}
        </div>
        <span class="label" style="display:block;margin:14px 0 6px">Price cap</span>
        <div class="seg">${[[0, 'Any'], ...CAPS.map(c => [c, SYM[state.cur] + c])].map(([c, l]) => `<button class="${(o.cap || 0) === c ? 'on' : ''}" data-cap="sh:${c}">${l}</button>`).join('')}</div>
        <p class="hint" style="margin:6px 0 0">Uses the cheaper of the Steam price and keyshops. Free games always pass.</p></div>
        ${state.history.length ? `<div class="panel"><h3>Recent rolls</h3><div class="history">${state.history.map(h => `<div><span>${esc(gameById[h.id].name)}</span><span class="x">${h.verdict || ''}</span></div>`).join('')}</div></div>` : ''}
      </aside></div>`;
    if (g && !state.rolling) { hydrate(g, $('#bigcard')); loadGameNews(g, $('#bigcard')); }
  }
  function bigCard(g) {
    const s = status(g);
    return `<div class="bigcard" id="bigcard">${mediaHtml(g)}<div class="body">
      <div class="ttl"><h2 id="bigTitle">${esc(g.name)}</h2>${review(g)}</div>
      <div class="tagrow" style="margin-top:12px">${tags(g)}<span class="tags" data-stags></span></div>
      <p class="desc" data-desc>${esc(g.desc || '')}</p>
      <div class="big-row">
        <div class="stat"><span class="label">Players</span><b>${g.max ? 'up to ' + g.max : isMulti(g) ? 'multi' : '?'}</b></div>
        <div class="stat"><span class="label">Group hours</span><b>${fmt(s.groupH)}h</b></div>
        <div class="stat"><span class="label">Owned by</span><b class="stack">${s.owners.slice(0, 10).map(p => av(p, 'sm')).join('') || '—'}</b></div>
      </div>
      <div style="margin-top:14px">${priceBlock(g)}</div>
      ${s.missing.length ? `<div style="margin-top:10px">${needsHtml(s)}</div>` : ''}
      ${lastPlayedHtml(g)}
      ${updatedHtml(g)}
      ${s.unknown.length ? `<div style="margin-top:8px">${unknownHtml(s)}</div>` : ''}
      <div style="margin-top:12px;font-size:14px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">${pitchBtn(g)}<a href="${storeUrl(g)}" target="_blank" rel="noopener">View on Steam ↗</a>${modLinks(g)}</div>
    </div></div>`;
  }
  function roll() {
    if (state.rolling) return;
    const p = pool();
    if (!p.length) { toast('Nothing in the pool. Unlock a filter or widen the pool.'); return; }
    let choices = p.filter(g => g.id !== state.current); if (!choices.length) choices = p;
    const pick = choices[Math.floor(Math.random() * choices.length)];
    state.rolling = true;
    if (!state.current) { state.current = pick.id; renderShuffle(); }
    const cardEl = $('#bigcard'), title = $('#bigTitle');
    if (cardEl) { cardEl.classList.add('rolling'); const v = cardEl.querySelector('video'); if (v) v.pause(); }
    let n = 0;
    const iv = setInterval(() => {
      if (title) title.textContent = p[Math.floor(Math.random() * p.length)].name;
      if (++n > 10) {
        clearInterval(iv);
        state.current = pick.id;
        state.history.unshift({ id: pick.id });
        state.history = state.history.slice(0, 8);
        state.rolling = false;
        renderShuffle();
      }
    }, 60);
  }

  /* ---------- discovery ---------- */
  const SRC = LIVE ? [['played', 'Most played'], ['seller', 'Top sellers'], ['popularnew', 'Popular new'], ['sale', 'On sale']]
                   : [['played', 'Most played'], ['seller', 'Top sellers'], ['sale', 'On sale']];
  let chartsLoading = false;
  function chartList(src) {
    if (LIVE) return ((state.charts && state.charts[src]) || []).map(r => ({ g: gameById[r.appid], rank: r.rank, value: r.value })).filter(x => x.g);
    return GAMES.filter(g => src === 'sale' ? g.sale : g[src]).map(g => ({ g, rank: g[src] || 0, value: null }))
      .sort((a, b) => src === 'sale' ? b.g.sale - a.g.sale : a.rank - b.rank);
  }
  async function loadCharts() {
    if (chartsLoading) return; chartsLoading = true;
    try { const d = await API.call('/api/discovery'); mergeGames(d.games); state.charts = d.charts; state.chartsUpdated = d.updated; }
    catch { state.charts = {}; toast('Could not load the Steam charts. Try again in a minute.'); }
    chartsLoading = false;
    if (state.view === 'discovery') render();
  }
  const fmtNum = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n);
  function renderDiscovery() {
    const d = state.disc;
    if (LIVE && !state.charts) {
      $('#view').innerHTML = `<div class="section-head" style="margin-top:0"><h2>Discovery</h2></div><div class="empty">Loading Steam's charts…</div>`;
      loadCharts(); return;
    }
    const all = chartList(d.src);
    const list = all.filter(({ g }) => {
      if (d.unowned && ownCount(g) > 0) return false;
      if (d.single ? !knownSingle(g) : !isMulti(g)) return false;
      if (d.modded && !g.modded) return false;
      if (d.small && !small(g)) return false;
      if (!underCap(g, d.cap)) return false;
      return true;
    });
    const fl = [['unowned', 'Nobody owns it yet'], ['modded', '🔧 Modded'], ['small', '💾 Under 20 GB'], ['single', 'Single-player only']];
    const when = state.chartsUpdated ? ` · updated ${ago(state.chartsUpdated)}` : '';
    $('#view').innerHTML = `
      <div class="section-head" style="margin-top:0"><h2>Discovery</h2><span class="count">${list.length}</span><p>Steam's live charts${LIVE ? when : ''}. Click a game for the trailer.</p></div>
      <div class="disc-bar">
        <div class="seg" style="min-width:${SRC.length * 112}px">${SRC.map(([k, l]) => `<button class="${d.src === k ? 'on' : ''}" data-dsrc="${k}">${l}</button>`).join('')}</div>
        <div class="filters">${fl.map(([k, l]) => `<button class="toggle ${d[k] ? 'on' : ''}" data-dtf="${k}">${l}</button>`).join('')}<span class="fsep"></span>${capBtns('disc', d.cap)}</div>
      </div>
      ${list.length ? `<div class="grid" style="margin-top:20px">${list.map(discCard).join('')}</div>`
        : `<div class="empty" style="margin-top:20px">${all.length ? 'Nothing matches. Try turning a filter off.' : 'No chart data yet. Check back in a few minutes.'}</div>`}
      <p class="hint" style="margin-top:20px">${all.length - list.length > 0 ? `${all.length - list.length} more hidden by filters. ` : ''}Charts refresh daily from Steam. Keyshop prices via <a href="https://gg.deals" target="_blank" rel="noopener">GG.deals</a>.</p>`;
  }
  function discCard({ g, rank, value }) {
    const d = state.disc, n = ownCount(g);
    const badge = d.src === 'sale' ? (g.sale ? `-${g.sale}%` : `#${rank}`) : `#${rank}`;
    return `<article class="gcard"><div style="position:relative">${art(g, true)}<span class="rank">${badge}</span></div>
      <div class="body">${title(g)}${tags(g)}
        <p class="desc sm">${esc((g.desc || '').slice(0, 160))}${(g.desc || '').length > 160 ? '…' : ''}</p>
        <div class="meta"><span>${value ? `🔥 ${fmtNum(value)} peak players` : playersTxt(g)}</span><span>${n ? n + ' of the crew own it' : 'Nobody owns it'}</span></div>
        ${priceBlock(g)}
      </div>
      <div class="actions">${pitchBtn(g)}<button class="linkbtn" data-details="${g.id}">▶ Trailer &amp; details</button></div>
    </article>`;
  }

  /* ---------- news ---------- */
  async function loadNews() {
    if (!LIVE) { state.news = (D.NEWS || []).slice(); return render(); }
    try { const r = await API.call('/api/news' + (state.newsMine ? '?mine=1' : '')); state.news = r.items; }
    catch { state.news = []; toast('Could not load news.'); }
    if (state.view === 'news') render();
  }
  function renderNews() {
    if (!state.news) { $('#view').innerHTML = '<div class="empty">Loading news…</div>'; loadNews(); return; }
    const mineSet = new Set(Object.keys(LIB[ME] || {}).map(Number));
    const list = state.news.filter(n => (!state.newsPatch || n.patch) && (LIVE || !state.newsMine || mineSet.has(n.appid)))
      .sort((a, b) => b.date - a.date);
    const day = ts => { const d = (Date.now() - ts) / 864e5; return d < 1 ? 'Today' : d < 2 ? 'Yesterday' : d < 7 ? 'This week' : d < 31 ? 'This month' : 'Earlier'; };
    let last = '';
    $('#view').innerHTML = `
      <div class="section-head" style="margin-top:0"><h2>News</h2><p>Updates and announcements for games the crew owns.</p></div>
      <div class="filters" style="margin-bottom:18px">
        <button class="toggle ${!state.newsMine ? 'on' : ''}" data-newsmine="0">Whole crew</button>
        <button class="toggle ${state.newsMine ? 'on' : ''}" data-newsmine="1">My games</button>
        <button class="toggle ${state.newsPatch ? 'on' : ''}" data-newspatch>🛠 Updates only</button>
      </div>
      ${list.length ? list.map(n => {
        const g = gameById[n.appid] || { id: n.appid, name: n.name || 'App ' + n.appid, img: n.img, tags: [] };
        const head = day(n.date) !== last ? `<h3 class="news-day">${(last = day(n.date))}</h3>` : '';
        return `${head}<article class="news-item">
          <div class="news-art">${art(g, true)}</div>
          <div class="news-body">
            <div class="news-top"><button class="linkbtn n" data-details="${g.id}">${esc(g.name)}</button>${n.patch ? '<span class="tag patch">🛠 Update</span>' : ''}<span class="news-when">${since(n.date)}</span></div>
            <a class="news-title" href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a>
            ${n.snippet ? `<p>${esc(n.snippet)}${n.snippet.length >= 238 ? '…' : ''}</p>` : ''}
            <div class="news-foot"><span>${ownCount(g)} of the crew own it</span>${g.size ? `<span>💾 ${sizeTxt(g.size)}</span>` : ''}</div>
          </div></article>`;
      }).join('') : `<div class="empty">${LIVE ? 'No news yet. It fills in as the backend checks the games the crew plays. Check back in a bit.' : 'Nothing here.'}</div>`}`;
  }

  /* ---------- pitches ---------- */
  let pitchesLoading = false, searchT, searchSeq = 0;
  async function loadPitches() {
    if (pitchesLoading) return; pitchesLoading = true;
    try { const d = await API.call('/api/pitches'); mergeGames(d.games); state.pitches = d.pitches; state.pitchesLoaded = true; }
    catch { toast('Could not load pitches.'); state.pitchesLoaded = true; }
    pitchesLoading = false;
    if (state.view === 'pitches') render();
  }
  function renderPitches() {
    if (LIVE && !state.pitchesLoaded) { $('#view').innerHTML = `<div class="empty">Loading pitches…</div>`; loadPitches(); return; }
    const sorted = [...state.pitches].filter(p => gameById[p.game] && crewById[p.by]).sort((a, b) => b.votes.length - a.votes.length || b.at - a.at);
    $('#view').innerHTML = `<div class="pitch-layout"><div>
        <div class="section-head" style="margin-top:0"><h2>Search</h2></div>
        <div class="search"><input id="q" placeholder="Search for a game…" value="${esc(state.query)}" autocomplete="off"></div>
        <p class="hint">${LIVE ? 'Searches the whole Steam store.' : 'The prototype only searches a small fake list.'}</p>
        <div class="results" id="results">${resultsHtml()}</div>
      </div><div>
        <div class="section-head" style="margin-top:0"><h2>Shortlist</h2><span class="count">${sorted.length}</span><p>Vote for what you'd play.</p></div>
        <div class="shortlist">${sorted.length ? sorted.map(pitchHtml).join('') : '<div class="empty">No pitches yet. Search for a game and pitch it.</div>'}</div>
      </div></div>`;
  }
  function resultsHtml() {
    const q = state.query.trim().toLowerCase();
    if (!q) return `<div class="empty">Try “lethal”, “deep rock” or “golf”.</div>`;
    const local = GAMES.filter(g => g.name.toLowerCase().includes(q) && ownCount(g) > 0);
    const remote = (state.searchQ === q ? state.searchIds || [] : []).map(id => gameById[id]).filter(Boolean);
    const res = [...new Map([...remote, ...local].map(g => [g.id, g])).values()].slice(0, 10);
    if (!res.length && LIVE && state.searchQ !== q) return `<div class="empty">Searching Steam…</div>`;
    if (!res.length) return `<div class="empty">No matches for “${esc(state.query)}”.</div>`;
    return res.map(g => `<div class="result">${art(g, true)}<div><b>${esc(g.name)}</b><small>${ownCount(g)} of the crew own it${g.size ? ` · 💾 ${sizeTxt(g.size)}` : ''}</small>${priceBlock(g)}</div>${pitchBtn(g, 'btn sm')}</div>`).join('');
  }
  function pitchHtml(p) {
    const g = gameById[p.game], mine = p.votes.includes(ME);
    const to = p.to.length ? p.to.filter(t => crewById[t]).map(t => '@' + esc(crewById[t].name)).join(' ') : 'everyone';
    return `<div class="pitch ${state.flashPitch === p.id ? 'flash' : ''}" id="pitch-${p.id}">
      <button class="vote ${mine ? 'on' : ''}" data-vote="${p.id}" title="${mine ? 'Remove vote' : 'Vote'}"><span>▲</span>${p.votes.length}</button>
      <div><h4>${esc(g.name)}${p.by === ME && LIVE ? ` <button class="linkbtn del" data-delpitch="${p.id}" title="Delete your pitch">delete</button>` : ''}</h4>
        <div class="by">${av(p.by, 'sm')} ${esc(crewById[p.by].name)} → ${to} · ${ago(p.at)}</div>
        ${p.note ? `<div class="note">“${esc(p.note)}”</div>` : ''}
        <div class="foot"><span>${price(g)}</span><span>${ownCount(g)}/${CREW.length} own it</span><span class="stack">${p.votes.filter(v => crewById[v]).map(v => av(v, 'sm')).join('')}</span><button class="linkbtn" data-details="${g.id}">▶ Trailer</button></div>
      </div></div>`;
  }
  function openPitch(id) { draft = { game: +id, to: [], note: '' }; renderModal(); $('#modal').hidden = false; setTimeout(() => $('#note') && $('#note').focus(), 30); }
  function closeModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; draft = null; }
  function renderModal() {
    const g = gameById[draft.game];
    $('#modal').innerHTML = `<div class="sheet" role="dialog" aria-label="Pitch a game">${art(g)}<div class="in">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><h3>Pitch ${esc(g.name)}</h3><button class="linkbtn" data-close>Close ✕</button></div>
      <div><div class="label" style="margin-bottom:8px">Who's it for?</div><div class="crew">
        <button class="chip ${!draft.to.length ? 'on' : ''}" data-to="">Everyone</button>
        ${CREW.filter(c => c.id !== ME).map(c => `<button class="chip ${draft.to.includes(c.id) ? 'on' : ''}" data-to="${c.id}">${av(c.id, 'sm')}${esc(c.name)}</button>`).join('')}
      </div></div>
      <div><div class="label" style="margin-bottom:8px">Note</div><textarea id="note" rows="2" placeholder="Hey look at this game…">${esc(draft.note)}</textarea></div>
      <div><div class="label" style="margin-bottom:8px">Discord preview · #game-night</div><div id="dpreview">${discordPreview()}</div></div>
      <div style="display:flex;gap:10px;justify-content:flex-end"><button class="btn ghost" data-close>Cancel</button><button class="btn blurple" id="sendPitch">Send pitch</button></div>
    </div></div>`;
  }
  function discordPreview() {
    const g = gameById[draft.game];
    const mentions = draft.to.map(t => `<span class="mention">@${esc(crewById[t].name)}</span>`).join(' ');
    return `<div class="discord"><div class="bot">Game Night<em>APP</em></div>
      <div>${mentions} ${esc(crewById[ME].name)} pitched a game 👀</div>
      <div class="embed"><b>${esc(g.name)}</b><div>${draft.note ? esc(draft.note) : '<i style="opacity:.6">No note</i>'}</div>
      <div style="opacity:.7;font-size:12px;margin-top:4px">Steam ${price(g)}${P(g).key ? ` · keys from ${money(P(g).key)}` : ''} · ${ownCount(g)}/${CREW.length} of the crew own it</div></div></div>`;
  }

  /* ---------- leaderboard + compare ---------- */
  function renderLb() {
    const views = [['rank', 'Rankings'], ['compare', 'Compare']];
    const head = `<div class="lb-head"><h2>Leaderboard</h2><div class="seg" style="width:240px">${views.map(([k, l]) => `<button class="${state.lbView === k ? 'on' : ''}" data-lbv="${k}">${l}</button>`).join('')}</div></div>`;
    $('#view').innerHTML = head + (state.lbView === 'compare' ? compareHtml() : rankingsHtml());
  }
  const TAGLINES = {
    recent: ['go outside', 'touch grass', 'your chair has filed a complaint', 'the sun misses you', 'hydrate. please.', 'have you seen daylight this week?',
      'your mam is worried', 'certified basement goblin', 'shower speedrun any%', 'sleep is not a debuff', 'blink twice if you need help'],
    all: ['no-life speedrun any%', 'Gabe owes you a pension', 'hours played > hours slept', 'living legend / cautionary tale', 'retire already',
      'the grind never stops (it should)', 'certified chair fossil'],
    owned: ['Steam sale victim', 'the backlog is load-bearing', "Gabe's favourite customer", 'buys games, plays none', 'collector, not a player',
      'wallet left the chat', '"I\'ll play it eventually"'],
    value: ['account worth more than their car', "Gabe's retirement fund", 'financially irresponsible, digitally rich', 'could have bought a house',
      'the wallet is crying', 'living proof sales work'],
    fivem: ['lives in Los Santos', 'more RP hours than real-life hours', 'has a second life (literally)', 'the city never sleeps, neither do they', 'certified roleplayer', 'still waiting for their whitelist'],
    onetrick: ['one game, one love', 'has heard of other games, allegedly', 'loyalty or Stockholm syndrome?', 'commitment issues: none', 'a one-trick pony'],
    variety: ['can’t commit to anything', 'the sampler platter', 'attention span of a goldfish', 'tries everything once', 'serial game-hopper'],
    backlog: ['the backlog is load-bearing', '“I’ll get to it”', 'collector, not a player', 'pile of shame champion', 'buys more than they play'],
    freeloader: ['never paid for a game in their life', 'Gabe gets nothing', 'free-to-play, free to stay', 'cheapskate royalty', 'wallet untouched'],
    level: ['badge-crafting addict', 'spent more on Steam level than games', 'the trading card economy thanks you', 'Steam’s favourite son'],
    age: ['remembers Steam when it was bad', 'older than some of the crew', 'ancient one', 'was here before it was cool', 'Half-Life 2 veteran'],
    ach: ['achievement hunter', 'completionist brain', '100% or nothing', 'reads the achievement list first', 'needs the little trophies'],
    perfect: ['completionist brain', 'touch grass (after 100%)', 'got every single one', 'the platinum goblin'],
    badges: ['badge hoarder', 'collects everything', 'trading card capitalist'],
    friends: ['knows everyone', 'Steam social butterfly', 'adds randoms after every match', 'popular, allegedly'],
    cs2kd: ['actually decent at CS', 'top fragger', 'baits teammates, probably', 'aim diff', 'the one carrying'],
    cs2hs: ['one tap merchant', 'aims for the head (only)', 'heads only', 'crosshair placement king'],
    cs2win: ['wins more than they lose', 'carries the team', 'winners queue'],
    cs2mvps: ['MVP hoarder', 'main character energy', 'the star of every round'],
    shame: ['money well spent (not)', 'bought it, never launched it', 'Steam sale’s favourite victim', 'the backlog is load-bearing',
      '“it was only €3 though”', 'donating to Valve, basically'],
  };
  function tagline(c, mode) {
    // Same line for the whole week, so it doesn't change on every refresh
    const week = Math.floor(Date.now() / (7 * 86400e3));
    const key = `${c.id}|${mode}|${week}`;
    let h = 0; for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const list = TAGLINES[mode];
    return list[h % list.length];
  }
  const fullPrice = g => !g || g.f2p ? 0 : (P(g).base || P(g).steam || 0);
  const gname = id => (gameById[id] || {}).name || 'something';
  const LOADED_AT = Date.now();
  const FIVEM = 218;
  const LB_ICONS = { Playtime: '⏱️', Library: '📚', Money: '💸', Steam: '🎖️', CS2: '🎯' };
  const LB_GROUPS = [
    ['Playtime', [['recent', 'Last 2 weeks'], ['all', 'All time'], ['fivem', 'FiveM'], ['onetrick', 'One-trick'], ['variety', 'Variety']]],
    ['Library', [['owned', 'Games owned'], ['backlog', 'Backlog %'], ['freeloader', 'Free-game hours']]],
    ['Money', [['value', 'Account value'], ['shame', 'Unplayed spend']]],
    ['Steam', [['level', 'Steam level'], ['age', 'Oldest account'], ['ach', 'Achievement %'], ['perfect', 'Perfect games'], ['badges', 'Badges'], ['friends', 'Friends']]],
    ['CS2', [['cs2kd', 'K/D'], ['cs2hs', 'Headshot %'], ['cs2win', 'Win rate'], ['cs2mvps', 'MVPs']]],
  ];
  // Every board: who's on it, their number, and an optional "mostly X" line
  function lbMetric(mode, c) {
    const lib = LIB[c.id] || {}, ids = Object.keys(lib), x = c.x || {}, cs = x.cs2 || {};
    const sum = f => ids.reduce((a, id) => a + f(id), 0);
    const topBy = f => { let top = null, topV = 0; ids.forEach(id => { const v = f(id); if (v > topV) { topV = v; top = id; } }); return { top, topV }; };
    const allH = sum(id => lib[id].h);
    switch (mode) {
      case 'recent': return { val: sum(id => lib[id].h2w), ...topBy(id => lib[id].h2w), fav: t => `Mostly ${gname(t.top)} · ${fmt(t.topV)}h` };
      case 'all': return { val: allH, ...topBy(id => lib[id].h), fav: t => `Mostly ${gname(t.top)} · ${fmt(t.topV)}h` };
      case 'fivem': { const f = lib[FIVEM]; return f && f.h ? { val: f.h, fav: () => `${f.h2w ? fmt(f.h2w) + 'h in the last 2 weeks' : 'not played lately'}${f.lp ? ' · last on ' + since(f.lp) : ''} · ${allH ? Math.round(f.h / allH * 100) : 0}% of all their hours` } : null; }
      case 'onetrick': { const t = topBy(id => lib[id].h); return allH > 10 ? { val: Math.round(t.topV / allH * 1000) / 10, ...t, fav: t => `${gname(t.top)} · ${fmt(t.topV)}h` } : null; }
      case 'variety': { const played = ids.filter(id => lib[id].h2w > 0); return { val: played.length, fav: () => played.slice(0, 4).map(gname).join(', ') }; }
      case 'owned': return { val: ids.length };
      case 'backlog': { const paid = ids.filter(id => gameById[id] && !gameById[id].f2p); const nev = paid.filter(id => !lib[id].h); return paid.length >= 5 ? { val: Math.round(nev.length / paid.length * 1000) / 10, fav: () => `${nev.length} of ${paid.length} paid games never launched` } : null; }
      case 'freeloader': return { val: sum(id => gameById[id] && gameById[id].f2p ? lib[id].h : 0), ...topBy(id => gameById[id] && gameById[id].f2p ? lib[id].h : 0), fav: t => `Mostly ${gname(t.top)} · ${fmt(t.topV)}h` };
      case 'value': if (c.hide_money) return null; return { val: sum(id => fullPrice(gameById[id])), ...topBy(id => fullPrice(gameById[id])), fav: t => `Priciest: ${gname(t.top)} · ${money(t.topV)}` };
      case 'shame': { if (c.hide_money) return null; const f = id => lib[id].h ? 0 : fullPrice(gameById[id]); const n = ids.filter(id => f(id) > 0).length; return { val: sum(f), ...topBy(f), fav: t => `${n} unplayed games · worst: ${gname(t.top)} (${money(t.topV)})` }; }
      case 'level': return x.level != null ? { val: x.level } : null;
      case 'age': return x.created ? { val: Math.round((Date.now() - x.created) / (365.25 * 864e5) * 10) / 10, fav: () => 'since ' + new Date(x.created).toLocaleDateString('en-IE', { month: 'short', year: 'numeric' }) } : null;
      case 'ach': return x.ach_pct != null ? { val: x.ach_pct, fav: () => 'across their most played games' } : null;
      case 'perfect': return x.perfect != null ? { val: x.perfect } : null;
      case 'badges': return x.badges != null ? { val: x.badges } : null;
      case 'friends': return x.friends != null ? { val: x.friends } : null;
      case 'cs2kd': return cs.kd != null ? { val: cs.kd, fav: () => `${fmt(cs.kills)} kills · ${fmt(cs.matches)} matches` } : null;
      case 'cs2hs': return cs.hs != null ? { val: cs.hs } : null;
      case 'cs2win': return cs.win != null ? { val: cs.win, fav: () => `${fmt(cs.matches)} matches` } : null;
      case 'cs2mvps': return cs.mvps != null ? { val: cs.mvps } : null;
    }
    return null;
  }
  const LB_UNIT = { fivem: 'hrs in FiveM', recent: 'hrs · 2 weeks', all: 'hrs · all time', onetrick: 'of hours in one game', variety: 'games · 2 weeks', owned: 'games', backlog: 'never launched', freeloader: 'hrs in free games',
    value: 'full Steam price', shame: 'never launched', level: 'Steam level', age: 'years on Steam', ach: 'achievements', perfect: '100% games', badges: 'badges', friends: 'friends',
    cs2kd: 'kills per death', cs2hs: 'headshots', cs2win: 'matches won', cs2mvps: 'MVPs' };
  const PCT = new Set(['onetrick', 'backlog', 'ach', 'cs2hs', 'cs2win']);
  function rankingsHtml() {
    const pub = CREW.filter(c => !c.private), mode = state.lb;
    const isMoney = mode === 'value' || mode === 'shame';
    const rows = pub.map(c => { const m = lbMetric(mode, c); return m ? { c, ...m, val: Math.round(m.val * 100) / 100 } : null; }).filter(Boolean).sort((a, b) => b.val - a.val);
    const left = pub.filter(c => !rows.find(r => r.c.id === c.id));
    const max = rows[0] ? rows[0].val || 1 : 1;
    const show = v => isMoney ? money(v) : PCT.has(mode) ? v + '%' : mode === 'cs2kd' ? v.toFixed(2) : fmt(v);
    const favOf = r => { try { return r.fav && (r.top === undefined || r.topV) ? esc(r.fav(r)) : ''; } catch { return ''; } };
    const together = GAMES.filter(g => !g.disc).map(g => {
      const pl = pub.filter(c => owns(c.id, g.id));
      return { g, n: pl.length, h: pl.reduce((a, c) => a + LIB[c.id][g.id].h, 0) };
    }).filter(x => x.n >= 2 && x.h > 0).sort((a, b) => b.h - a.h).slice(0, 8);
    const priv = CREW.filter(c => c.private).map(c => c.name).join(', ');
    const steamy = ['level', 'age', 'ach', 'perfect', 'badges', 'friends'].includes(mode) || mode.startsWith('cs2');
    const leftNote = left.length ? `${esc(left.map(c => c.name).join(', '))} not on this board (${isMoney ? 'chose to hide their spending' : steamy ? (mode.startsWith('cs2') ? 'no CS2 stats, or' : 'not loaded yet, or') + ' stats hidden' : 'not enough data'}). ` : '';
    return `<div class="lb-layout"><div>
        ${(() => { const cat = LB_GROUPS.find(([, ms]) => ms.some(([k]) => k === mode)) || LB_GROUPS[0];
          return `<nav class="lb-cats">${LB_GROUPS.map(([g, ms]) => `<button class="${g === cat[0] ? 'on' : ''}" data-lb="${ms[0][0]}"><span class="ic">${LB_ICONS[g]}</span>${g}</button>`).join('')}</nav>
          <div class="lb-boards">${cat[1].map(([k, l]) => `<button class="${mode === k ? 'on' : ''}" data-lb="${k}">${l}</button>`).join('')}</div>`; })()}
        ${rows.length ? rows.map((r, i) => `<div class="lbrow ${i === 0 ? 'gold' : ''}">
          <div class="rank-b r${i < 3 ? i + 1 : 0}">${i + 1}</div>${av(r.c.id, 'lg')}
          <div class="who"><div class="who-top"><button class="linkbtn name" data-view="profile" data-profile="${r.c.id}">${esc(r.c.name)}</button>${i === 0 && r.val > 0 && TAGLINES[mode] ? `<span class="tagline">${esc(tagline(r.c, mode))}</span>` : ''}</div>${favOf(r) ? `<div class="fav">${favOf(r)}</div>` : ''}
            <div class="bar"><i style="width:${Math.max(0, r.val / max) * 100}%"></i></div></div>
          <div class="val">${show(r.val)}<small>${LB_UNIT[mode]}</small></div></div>`).join('') : `<div class="empty">Nobody on this board yet. ${steamy ? 'Steam profile numbers load once a day per person.' : ''}</div>`}
        ${isMoney ? `<p class="hint">${mode === 'value' ? 'What every game in each library would cost at today’s full Steam price.' : 'Full Steam price of games bought and never launched. Steam doesn’t share real purchase history, so this is the closest honest number.'} Games still loading prices count as zero.</p>` : ''}
        ${mode === 'onetrick' ? '<p class="hint">Share of all their hours spent in their single most played game.</p>' : ''}
        ${mode === 'fivem' ? '<p class="hint">Steam counts FiveM time as “Source SDK Base 2007”, so this is that number. It’s included in everyone’s total hours too.</p>' : ''}
        <p class="hint">${leftNote}${priv ? esc(priv) + ' not shown (Steam private or not linked). ' : ''}Anyone can hide their stats or spending from their profile.
          ${LIVE ? ` Data loaded ${ago(LOADED_AT)}. <button class="linkbtn" data-act="reload">Refresh</button>` : ''}</p>
      </div>
      <div class="panel"><h3>Most played together</h3><ul class="together">
        ${together.map(t => `<li><span>${esc(t.g.name)}</span><span>${fmt(t.h)}h · ${t.n} players</span></li>`).join('') || '<li><span>Not enough data yet</span></li>'}
      </ul></div></div>`;
  }
  function compareHtml() {
    const pub = CREW.filter(c => !c.private);
    let [a, b] = state.cmp;
    if (!pub.find(c => c.id === a)) a = (pub[0] || {}).id;
    if (!pub.find(c => c.id === b) || b === a) b = (pub.find(c => c.id !== a) || {}).id;
    state.cmp = [a, b];
    if (!a || !b) return `<div class="empty">You need at least two people with public Steam libraries to compare.</div>`;
    const la = LIB[a] || {}, lb = LIB[b] || {};
    const ca = crewById[a].color, cb = crewById[b].color;
    const sum = (l, k) => Object.values(l).reduce((s, x) => s + x[k], 0);
    const stats = [
      ['Hours · last 2 weeks', sum(la, 'h2w'), sum(lb, 'h2w')],
      ['Hours · all time', sum(la, 'h'), sum(lb, 'h')],
      ['Games owned', Object.keys(la).length, Object.keys(lb).length],
      ['Account value', Object.keys(la).reduce((s, id) => s + fullPrice(gameById[id]), 0), Object.keys(lb).reduce((s, id) => s + fullPrice(gameById[id]), 0), true],
      ['Unplayed spend', Object.keys(la).reduce((s, id) => s + (la[id].h ? 0 : fullPrice(gameById[id])), 0), Object.keys(lb).reduce((s, id) => s + (lb[id].h ? 0 : fullPrice(gameById[id])), 0), true],
    ].filter(r => !r[3] || (!crewById[a].hide_money && !crewById[b].hide_money));
    const xa = crewById[a].x || {}, xb = crewById[b].x || {};
    const extraRow = (l, f, d = 1) => { const p = f(xa), q = f(xb); if (p != null && q != null) stats.push([l, Math.round(p * d) / d, Math.round(q * d) / d]); };
    extraRow('Steam level', x => x.level);
    extraRow('Years on Steam', x => x.created ? (Date.now() - x.created) / (365.25 * 864e5) : null, 10);
    extraRow('Achievement %', x => x.ach_pct, 10);
    extraRow('CS2 K/D', x => x.cs2 && x.cs2.kd, 100);
    extraRow('CS2 headshot %', x => x.cs2 && x.cs2.hs, 10);
    extraRow('CS2 win rate %', x => x.cs2 && x.cs2.win, 10);
    const both = Object.keys(la).filter(id => lb[id] && gameById[id]).map(id => ({ g: gameById[id], a: la[id].h, b: lb[id].h })).sort((x, y) => (y.a + y.b) - (x.a + x.b));
    const only = (l1, l2) => Object.keys(l1).filter(id => !l2[id] && gameById[id]).map(id => ({ g: gameById[id], h: l1[id].h })).sort((x, y) => y.h - x.h).slice(0, 6);
    const onlyA = only(la, lb), onlyB = only(lb, la);
    const top = both.slice(0, 10), maxH = Math.max(1, ...top.flatMap(x => [x.a, x.b]));
    const sel = (idx, cur) => `<select data-cmp="${idx}">${pub.map(c => `<option value="${c.id}" ${c.id === cur ? 'selected' : ''}>${esc(c.name)}${c.id === ME ? ' (you)' : ''}</option>`).join('')}</select>`;
    const onlyList = (list, who) => list.length ? `<ul class="together">${list.map(x => `<li><button class="linkbtn" data-details="${x.g.id}">${esc(x.g.name)}</button><span>${fmt(x.h)}h</span></li>`).join('')}</ul>` : `<p class="hint">Nothing ${esc(who)} has that the other doesn't.</p>`;
    return `<div class="cmp">
      <div class="cmp-head">
        <div class="cmp-side"><button class="linkbtn" data-view="profile" data-profile="${a}" title="View profile">${av(a, 'xl')}</button>${sel(0, a)}</div>
        <div class="vs">VS</div>
        <div class="cmp-side right">${sel(1, b)}<button class="linkbtn" data-view="profile" data-profile="${b}" title="View profile">${av(b, 'xl')}</button></div>
      </div>
      <div class="cmp-stats">${stats.map(([l, x, y, isMoney]) => { const t = (x + y) || 1; const f = isMoney ? money : fmt; return `<div class="cmp-stat">
        <b class="${x > y ? 'win' : ''}">${f(x)}</b>
        <div class="mid"><span class="label">${l}</span><div class="split"><i style="width:${(x / t) * 100}%;background:${ca}"></i><i style="width:${(y / t) * 100}%;background:${cb}"></i></div></div>
        <b class="${y > x ? 'win' : ''}">${f(y)}</b></div>`; }).join('')}
        <div class="cmp-stat"><b>${both.length}</b><div class="mid"><span class="label">Games you both own</span></div><b>${both.length}</b></div>
      </div>
      <div class="cmp-grid">
        <div class="panel"><h3>Both own · most played</h3>
          ${top.length ? top.map(x => `<div class="duo"><button class="linkbtn n" data-details="${x.g.id}">${esc(x.g.name)}</button>
            <div class="duo-bars"><div><i style="width:${(x.a / maxH) * 100}%;background:${ca}"></i></div><div><i style="width:${(x.b / maxH) * 100}%;background:${cb}"></i></div></div>
            <span class="hh">${fmt(x.a)}h<br>${fmt(x.b)}h</span></div>`).join('') : '<p class="hint">No games in common yet.</p>'}
        </div>
        <div class="panel"><h3>Only ${esc(crewById[b].name)} has</h3><p class="hint" style="margin-top:0">Ask them if it's worth it.</p>${onlyList(onlyB, crewById[b].name)}</div>
        <div class="panel"><h3>Only ${esc(crewById[a].name)} has</h3><p class="hint" style="margin-top:0">Good ones to pitch to them.</p>${onlyList(onlyA, crewById[a].name)}</div>
      </div></div>`;
  }

  /* ---------- profile ---------- */
  function mockProfile(id) {
    // Fake-data mode: build a profile from the sample libraries
    const c = crewById[id], lib = LIB[id] || {};
    const library = Object.entries(lib).map(([appid, x]) => {
      const g = gameById[appid] || { name: 'App ' + appid, tags: [] };
      return { appid: +appid, name: g.name, minutes: Math.round(x.h * 60), minutes_2w: Math.round(x.h2w * 60), tags: g.tags, multi: isMulti(g), free: g.f2p,
        modded: g.modded, img: g.img, price: { ie: g.f2p ? 0 : Math.round(((g.prices || {}).EUR || {}).base * 100), gb: g.f2p ? 0 : Math.round(((g.prices || {}).GBP || {}).base * 100), us: g.f2p ? 0 : Math.round(((g.prices || {}).USD || {}).base * 100) },
        hidden: id === ME ? store.get('hidden', []).includes(+appid) : undefined };
    }).sort((a, b) => b.minutes - a.minutes);
    const total = library.reduce((a, x) => a + x.minutes, 0);
    const snapshots = Array.from({ length: 30 }, (_, i) => ({ day: new Date(Date.now() - (29 - i) * 864e5).toISOString().slice(0, 10), minutes: Math.round(total - (29 - i) * (60 + ((i * 37) % 140))) }));
    const top = library.filter(x => x.minutes > 0).slice(0, 6);
    return {
      self: id === ME, user: { id, name: c.name, avatar: c.avatar, steam_linked: !c.unlinked, steam_private: !!c.private, last_sync: Date.now() - 3 * 3600e3 },
      steam_id: id === ME ? '76561198000000001' : undefined, library: c.private ? [] : library, snapshots: c.private ? [] : snapshots,
      extras: c.private ? null : {
        summary: { persona: c.name.toLowerCase() + '_gg', url: 'https://steamcommunity.com/', created: Date.UTC(2014 + (id.length % 5), 3, 1), country: 'IE' },
        level: 12 + id.length * 5,
        achievements: top.map((x, i) => ({ appid: x.appid, achieved: 10 + i * 7, total: 40 + i * 9 })),
        stats: top[0] ? [{ appid: top[0].appid, stats: [{ name: 'total_kills', value: 18342 }, { name: 'total_wins', value: 912 }, { name: 'total_time_played', value: top[0].minutes * 60 }, { name: 'total_mvps', value: 640 }] }] : [],
        profile: c.x ? { ...c.x, xp: c.x.level * 410, recent: library.filter(g => g.minutes_2w).slice(0, 4).map(g => ({ appid: g.appid, name: g.name, h2w: Math.round(g.minutes_2w / 6) / 10 })) } : null,
        cs2: lib[730] && c.x && c.x.cs2 ? { ...c.x.cs2, deaths: Math.round(c.x.cs2.kills / c.x.cs2.kd), rounds: c.x.cs2.matches * 22, hours: lib[730].h, bombs_planted: 410, bombs_defused: 120, knife: 37,
          last: { kills: 21, deaths: 14, mvps: 4, damage: 2650, rounds: 24, wins: 13, score: 58 } } : null,
        stat_games: library.filter(g => g.minutes > 60).slice(0, 12).map(g => ({ appid: g.appid, name: g.name })),
      },
      settings: id === ME ? store.get('settings', {}) : undefined,
      stats_hidden: id === ME ? !!store.get('settings', {}).hide_stats : false,
    };
  }
  async function loadProfile(id) {
    if (!LIVE) { state.profiles[id] = mockProfile(id); return; }
    try { state.profiles[id] = await API.call(`/api/profile/${id}`); }
    catch { state.profiles[id] = { error: true }; }
  }
  const hrsOf = m => Math.round(m / 6) / 10;
  const prettyStat = n => n.replace(/^total_/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const statVal = (n, v) => /time/i.test(n) ? fmt(Math.round(v / 360) / 10) + 'h' : fmt(v);
  function renderProfile() {
    const id = state.profileId || ME, v = $('#view');
    if (!crewById[id]) { v.innerHTML = '<div class="empty">That person isn’t in the crew.</div>'; return; }
    const P = state.profiles[id];
    if (!P) { v.innerHTML = '<div class="empty">Loading profile…</div>'; loadProfile(id).then(() => { if (state.view === 'profile' && state.profileId === id) render(); }); return; }
    if (P.error) { v.innerHTML = '<div class="empty">Couldn’t load that profile. Try again in a minute.</div>'; return; }
    const c = crewById[id], x = P.extras || {}, sm = x.summary || {}, self = P.self;
    const visible = P.library.filter(g => !g.hidden);
    const total = visible.reduce((a, g) => a + g.minutes, 0), twoW = visible.reduce((a, g) => a + g.minutes_2w, 0);
    const never = visible.filter(g => !g.minutes).length;
    const cc = CC[state.cur];
    const worth = visible.reduce((a, g) => a + (g.free ? 0 : (g.price && g.price[cc]) || 0), 0) / 100;
    const multiMin = visible.filter(g => g.multi).reduce((a, g) => a + g.minutes, 0);
    const top = visible.filter(g => g.minutes > 0).slice(0, 10), maxTop = Math.max(1, ...top.map(g => g.minutes));
    const tagH = {};
    visible.forEach(g => (g.tags || []).slice(0, 3).forEach(t => { tagH[t] = (tagH[t] || 0) + g.minutes; }));
    const tagList = Object.entries(tagH).sort((a, b) => b[1] - a[1]).slice(0, 8), maxTag = Math.max(1, ...tagList.map(t => t[1]));
    const ach = Object.fromEntries((x.achievements || []).map(a => [a.appid, a]));
    const gname = appid => (gameById[appid] || P.library.find(g => g.appid === +appid) || {}).name || 'App ' + appid;
    // daily hours from snapshots
    const sn = P.snapshots || [];
    const daily = sn.slice(1).map((d, i) => ({ day: d.day, h: Math.max(0, (d.minutes - sn[i].minutes) / 60) })).slice(-30);
    const maxD = Math.max(1, ...daily.map(d => d.h));
    const since = sm.created ? new Date(sm.created).getFullYear() : null;

    const moneyHidden = !self && c.hide_money;
    const tiles = [
      ['Total hours', fmt(hrsOf(total)) + 'h', `${fmt(Math.round(total / 60 / 24))} days of your life`, 'total'],
      ['Last 2 weeks', fmt(hrsOf(twoW)) + 'h', twoW ? `~${fmt(Math.round(twoW / 14 / 6) / 10)}h a day` : 'touching grass, apparently', 'recent'],
      ['Games owned', fmt(visible.length), self && P.library.length !== visible.length ? `${P.library.length - visible.length} hidden` : '', 'owned'],
      ['Never played', fmt(never), visible.length ? `${Math.round(never / visible.length * 100)}% of the library` : '', 'never'],
      moneyHidden ? ['Library value', '🔒', 'kept private', null] : ['Library value', money(worth), 'at full Steam price', c.hide_money ? null : 'value'],
      ['Multiplayer share', total ? Math.round(multiMin / total * 100) + '%' : '—', 'of hours in multiplayer games', 'multi'],
    ];
    const fm = visible.find(g => g.appid === 218);
    if (fm && fm.minutes) tiles.splice(2, 0, ['FiveM', fmt(hrsOf(fm.minutes)) + 'h', `${total ? Math.round(fm.minutes / total * 100) : 0}% of total · counted as Source SDK Base 2007`]);

    v.innerHTML = `<div class="pf">
      <div class="pf-head">
        ${av(id, 'xxl')}
        <div class="pf-id">
          <h1>${esc(c.name)}</h1>
          <div class="pf-sub">
            ${sm.persona ? `<span>Steam: <b>${esc(sm.persona)}</b></span>` : ''}
            ${x.level != null ? `<span class="lvl">Lv ${x.level}</span>` : ''}
            ${since ? `<span>On Steam since ${since}</span>` : ''}
            ${P.user.last_sync ? `<span>Synced ${ago(P.user.last_sync)}</span>` : ''}
          </div>
          <div class="pf-links">${sm.url ? `<a href="${esc(sm.url)}" target="_blank" rel="noopener">Steam profile ↗</a>` : ''}${!self && id !== ME ? `<button class="linkbtn" data-cmpwith="${id}">Compare with me</button>` : ''}</div>
        </div>
      </div>

      ${self ? steamPanel(P) : ''}
      ${!P.user.steam_linked ? `<div class="empty">${self ? 'Link your Steam account above to see your stats.' : esc(c.name) + ' hasn’t linked Steam yet.'}</div>` :
        P.user.steam_private ? `<div class="empty">${self ? 'Your Steam game details are private, so there’s nothing to show yet.' : esc(c.name) + '’s Steam library is private.'}</div>` : `
      <div class="tiles">${tiles.map(([l, val, sub, rk]) => { const r = rk && crewRank(rk, id); return `<div class="tile"><span class="label">${l}</span><b>${val}</b><small>${sub}</small>${r ? `<span class="crank ${r.pos <= 3 ? 'top' : ''}" title="Compared with everyone in the crew with a public Steam library">${['🥇', '🥈', '🥉'][r.pos - 1] || '#' + r.pos} ${r.pos <= 3 ? `#${r.pos} ` : ''}of ${r.of} in the crew${rk === 'never' && r.pos === 1 ? ' (oops)' : ''}</span>` : ''}</div>`; }).join('')}</div>

      <div class="pf-grid">
        <div class="panel"><h3>Most played</h3>
          ${top.length ? top.map(g => { const a = ach[g.appid]; return `<div class="pbar">
            <button class="linkbtn n" data-details="${g.appid}">${esc(g.name || gname(g.appid))}</button>
            <div class="track"><i style="width:${g.minutes / maxTop * 100}%"></i></div>
            <span class="v">${fmt(hrsOf(g.minutes))}h</span>
            ${a ? `<span class="ach" title="${a.achieved}/${a.total} achievements">🏆 ${Math.round(a.achieved / a.total * 100)}%</span>` : '<span class="ach none"></span>'}
          </div>`; }).join('') : '<p class="hint">No playtime yet.</p>'}
        </div>
        <div class="panel"><h3>Hours by tag</h3>
          ${tagList.length ? tagList.map(([t, m]) => `<div class="pbar tagbar"><span class="n">${esc(t)}</span><div class="track"><i style="width:${m / maxTag * 100}%"></i></div><span class="v">${fmt(hrsOf(m))}h</span></div>`).join('') : '<p class="hint">Tags fill in once Steam info has loaded.</p>'}
        </div>
      </div>

      <div class="panel" style="margin-top:18px"><h3>Hours per day <span class="hint" style="font:400 13px Outfit">· last 30 days</span></h3>
        ${daily.length >= 2 ? `<div class="spark">${daily.map(d => `<i title="${d.day}: ${fmt(Math.round(d.h * 10) / 10)}h" style="height:${Math.max(2, d.h / maxD * 100)}%"></i>`).join('')}</div>
          <div class="spark-x"><span>${daily[0].day}</span><span>${daily[daily.length - 1].day}</span></div>`
        : '<p class="hint">This builds up from nightly snapshots. Check back in a few days.</p>'}
      </div>

      ${P.stats_hidden && !self ? `<div class="empty" style="margin-top:18px">🔒 ${esc(c.name)} keeps their in-game stats private.</div>` : `
      <div class="pf-grid" style="margin-top:18px">
        ${steamProfileHtml(x)}
        ${(x.achievements || []).length ? `<div class="panel"><h3>Achievements <span class="hint" style="font:400 13px Outfit">· most played games</span></h3>${x.achievements.map(a => `<div class="pbar"><span class="n">${esc(gname(a.appid))}</span>
          <div class="track gold"><i style="width:${a.achieved / a.total * 100}%"></i></div><span class="v">${a.achieved}/${a.total}</span></div>`).join('')}</div>` : ''}
      </div>
      ${cs2Html(x.cs2)}
      ${statsExplorerHtml(id, P)}`}
      ${self ? privacyHtml(P) : ''}

      ${libraryPanel(P)}`}
    </div>`;
  }
  const yearsAgo = ts => { const y = (Date.now() - ts) / (365.25 * 864e5); return y >= 1 ? `${Math.floor(y)} year${y >= 2 ? 's' : ''}` : `${Math.max(1, Math.floor(y * 12))} months`; };
  function steamProfileHtml(x) {
    const pr = x.profile;
    if (!pr) return `<div class="panel"><h3>Steam profile</h3><p class="hint">Steam level, badges and friends load once a day. Check back soon.</p></div>`;
    const rows = [
      ['Steam level', pr.level != null ? `Lv ${pr.level}` : '—', pr.xp ? fmt(pr.xp) + ' XP' : ''],
      ['Account age', pr.created ? yearsAgo(pr.created) : '—', pr.created ? 'since ' + new Date(pr.created).toLocaleDateString('en-IE', { month: 'short', year: 'numeric' }) : ''],
      ['Badges', pr.badges != null ? fmt(pr.badges) : '—', ''],
      ['Steam friends', pr.friends != null ? fmt(pr.friends) : 'hidden', pr.friends == null ? 'friends list is private' : ''],
      ['Achievements', pr.ach_pct != null ? pr.ach_pct + '%' : '—', 'across most played games'],
      ['Perfect games', pr.perfect != null ? fmt(pr.perfect) : '—', '100% achievements'],
    ];
    return `<div class="panel"><h3>Steam profile</h3>
      <div class="stats">${rows.map(([l, v, sub]) => `<div><span class="label">${l}</span><b>${v}</b>${sub ? `<small class="hint">${esc(sub)}</small>` : ''}</div>`).join('')}</div>
      ${(pr.recent || []).length ? `<h4 class="sub">Recently played</h4><ul class="together">${pr.recent.map(g => `<li><button class="linkbtn" data-details="${g.appid}">${esc(g.name || 'App ' + g.appid)}</button><span>${fmt(g.h2w)}h · 2 weeks</span></li>`).join('')}</ul>` : ''}
    </div>`;
  }
  function cs2Html(c) {
    if (!c || !(c.kills || c.matches)) return '';
    const L = c.last;
    const life = [['K/D', c.kd ?? '—'], ['Headshot %', c.hs != null ? c.hs + '%' : '—'], ['Win rate', c.win != null ? c.win + '%' : '—'], ['Accuracy', c.acc != null ? c.acc + '%' : '—'],
      ['Matches', fmt(c.matches)], ['MVPs', fmt(c.mvps)], ['Kills', fmt(c.kills)], ['Bombs planted', fmt(c.bombs_planted)]];
    return `<div class="panel cs2" style="margin-top:18px"><h3>Counter-Strike 2 <span class="hint" style="font:400 13px Outfit">· lifetime</span></h3>
      <div class="stats four">${life.map(([l, v]) => `<div><span class="label">${l}</span><b>${v}</b></div>`).join('')}</div>
      ${L ? `<h4 class="sub">Last match</h4><div class="lastmatch">
        <div class="lm-big"><b>${L.kills}<i>/</i>${L.deaths}</b><span>kills / deaths</span></div>
        <div class="stats">${[['Rounds won', `${L.wins} of ${L.rounds}`], ['MVPs', L.mvps], ['Damage', fmt(L.damage)], ['Score', fmt(L.score)]].map(([l, v]) => `<div><span class="label">${l}</span><b>${v}</b></div>`).join('')}</div>
      </div>` : ''}
      <p class="hint" style="margin-bottom:0">Steam only shares lifetime totals and the last match. For full match history, try <a href="https://leetify.com" target="_blank" rel="noopener">Leetify</a> or <a href="https://csstats.gg" target="_blank" rel="noopener">csstats.gg</a>.</p>
    </div>`;
  }
  function statsExplorerHtml(id, P) {
    const list = (P.extras && P.extras.stat_games) || [];
    if (!list.length) return '';
    const cur = state.statPick[id] || ((P.extras.stats || [])[0] || {}).appid || list[0].appid;
    const key = id + ':' + cur, d = state.gstats[key];
    if (!d) loadGameStats(id, cur);
    const body = !d ? '<p class="hint">Loading stats…</p>' : d.hidden ? '<p class="hint">Hidden.</p>' : `
      ${d.achievements ? `<div class="pbar" style="margin-bottom:12px"><span class="n">Achievements</span><div class="track gold"><i style="width:${d.achievements.achieved / d.achievements.total * 100}%"></i></div><span class="v">${d.achievements.achieved}/${d.achievements.total}</span></div>` : ''}
      ${d.stats.length ? `<div class="stats four">${d.stats.map(k => `<div><span class="label">${esc(prettyStat(k.name))}</span><b>${statVal(k.name, k.value)}</b></div>`).join('')}</div>`
        : `<p class="hint">This game doesn’t share in-game stats with Steam${d.achievements ? ', only achievements' : ''}.</p>`}
      ${d.achievements && d.achievements.recent.length ? `<h4 class="sub">Latest unlocks</h4><ul class="together">${d.achievements.recent.map(a => `<li><span>🏆 ${esc(a.name)}</span><span>${since(a.at)}</span></li>`).join('')}</ul>` : ''}`;
    return `<div class="panel" style="margin-top:18px"><div class="lb-head" style="margin:0 0 12px"><h3 style="margin:0">Game stats</h3>
      <select data-statpick="${id}">${list.map(g => `<option value="${g.appid}" ${+g.appid === +cur ? 'selected' : ''}>${esc(g.name || 'App ' + g.appid)}</option>`).join('')}</select></div>${body}</div>`;
  }
  async function loadGameStats(id, appid) {
    const key = id + ':' + appid;
    if (state.gstats[key] || state.gstatsLoading[key]) return;
    state.gstatsLoading[key] = true;
    await Promise.resolve(); // never re-render in the middle of the render that asked for this
    try {
      state.gstats[key] = LIVE ? await API.call(`/api/profile/${id}/stats?appid=${appid}`) : mockGameStats(id, appid);
    } catch { state.gstats[key] = { stats: [], achievements: null }; }
    delete state.gstatsLoading[key];
    if (state.view === 'profile' && (state.profileId || ME) === id) render();
  }
  function mockGameStats(id, appid) {
    const h = ((LIB[id] || {})[appid] || {}).h || 10, seed = (+appid % 97) + 3;
    return {
      stats: [['total_kills', h * 31], ['total_wins', Math.round(h * 1.7)], ['total_time_played', h * 3600], ['total_deaths', h * 27], ['matches_played', Math.round(h * 2.2)], ['total_damage', h * 2100]].map(([name, value]) => ({ name, value })),
      achievements: { achieved: seed % 40 + 5, total: 50, recent: [{ name: 'Not bad', at: Date.now() - 3 * 864e5 }, { name: 'Getting there', at: Date.now() - 20 * 864e5 }] },
    };
  }
  function privacyHtml(P) {
    const st = P.settings || {};
    return `<div class="panel privacy" style="margin-top:18px"><h3>Privacy</h3>
      <label class="check"><input type="checkbox" data-setting="hide_stats" ${st.hide_stats ? 'checked' : ''}> <span><b>Hide my stats</b><small>In-game stats, achievements, CS2 numbers and Steam profile details. You’re also left off the Steam and CS2 leaderboards.</small></span></label>
      <label class="check"><input type="checkbox" data-setting="hide_money" ${st.hide_money ? 'checked' : ''}> <span><b>Hide my spending</b><small>Leaves you off the Account value and Unplayed spend boards.</small></span></label>
      <p class="hint" style="margin-bottom:0">Your playtime and games still show so the game finder keeps working. To hide single games, use the eye on your library below.</p></div>`;
  }
  async function saveSetting(key, val) {
    const P = state.profiles[ME];
    if (!LIVE) { const st = store.get('settings', {}); st[key] = val; store.set('settings', st); if (P) P.settings = st; Object.assign(crewById[ME], { [key]: val }); toast('Saved'); render(); return; }
    try {
      const r = await API.call('/api/me/settings', { method: 'POST', body: JSON.stringify({ [key]: val }) });
      if (P) P.settings = r.settings;
      crewById[ME][key] = val; if (key === 'hide_stats' && val) delete crewById[ME].x;
      toast(val ? 'Hidden from everyone else' : 'Visible again');
      render();
    } catch { toast('Couldn’t save that. Try again.'); }
  }
  // Where someone sits in the crew for each profile tile (same numbers the crew sees)
  function crewRank(key, id) {
    const pub = CREW.filter(c => !c.private && LIB[c.id] && (key !== 'value' || !c.hide_money));
    if (pub.length < 2 || !pub.find(c => c.id === id)) return null;
    const val = c => {
      const lib = LIB[c.id], ids = Object.keys(lib);
      const tot = ids.reduce((a, g) => a + lib[g].h, 0);
      if (key === 'total') return tot;
      if (key === 'recent') return ids.reduce((a, g) => a + lib[g].h2w, 0);
      if (key === 'owned') return ids.length;
      if (key === 'never') return ids.filter(g => !lib[g].h).length;
      if (key === 'value') return ids.reduce((a, g) => a + fullPrice(gameById[g]), 0);
      if (key === 'multi') return tot ? ids.reduce((a, g) => a + (gameById[g] && isMulti(gameById[g]) ? lib[g].h : 0), 0) / tot : 0;
      return 0;
    };
    const mine = val(crewById[id]);
    return { pos: 1 + pub.filter(c => c.id !== id && val(c) > mine).length, of: pub.length };
  }
  function steamPanel(P) {
    const u = P.user;
    const status = !u.steam_linked ? 'Not linked yet.' : u.steam_private ? '⚠️ Linked, but your Steam <b>Game details</b> are private.' : `Linked · ${fmt(u.game_count || P.library.length)} games.`;
    return `<div class="panel steam-panel"><h3>Your Steam account</h3>
      <p class="hint" style="margin:0 0 10px">${status}${P.steam_id ? ` <a href="https://steamcommunity.com/profiles/${esc(P.steam_id)}" target="_blank" rel="noopener">View ↗</a>` : ''}
        ${u.steam_private ? ' Set it to Public in <a href="https://steamcommunity.com/my/edit/settings" target="_blank" rel="noopener">Steam privacy settings</a>, then resync.' : ''}</p>
      <div class="notice-form" style="max-width:none">
        <input id="steamInput" placeholder="${u.steam_linked ? 'Paste a different Steam profile link to switch accounts' : 'steamcommunity.com/id/yourname'}" autocomplete="off">
        <button class="btn" id="steamLinkBtn">${u.steam_linked ? 'Change' : 'Link Steam'}</button>
        ${u.steam_linked ? '<button class="btn ghost" id="resyncBtn">Resync</button><button class="btn ghost" id="unlinkBtn">Unlink</button>' : ''}
      </div>
      ${LIVE ? '<p class="hint" style="margin:12px 0 0">Signed in with Discord. You stay logged in on this device. <button class="linkbtn" data-act="logout">Log out</button></p>' : ''}</div>`;
  }
  function libraryPanel(P) {
    const q = state.libQuery.trim().toLowerCase(), f = state.libFilter;
    const list = P.library.filter(g => (!q || (g.name || '').toLowerCase().includes(q)) &&
      (f === 'all' || (f === 'hidden' && g.hidden) || (f === 'never' && !g.minutes) || (f === 'multi' && g.multi)));
    const filters = [['all', 'All'], ['multi', 'Multiplayer'], ['never', 'Never played'], ...(P.self ? [['hidden', 'Hidden']] : [])];
    return `<div class="panel" style="margin-top:18px"><div class="lib-head"><h3 style="margin:0">${P.self ? 'Your library' : 'Library'} <span class="count">${list.length}</span></h3>
        <input id="libQ" placeholder="Search…" value="${esc(state.libQuery)}" autocomplete="off">
        <div class="filters">${filters.map(([k, l]) => `<button class="toggle ${f === k ? 'on' : ''}" data-libf="${k}">${l}</button>`).join('')}</div></div>
      ${P.self ? '<p class="hint" style="margin:6px 0 10px">Hidden games don’t count as owned on the site and are left off the leaderboards. Only you can see them here.</p>' : ''}
      <div class="lib">${list.slice(0, state.libShow).map(g => `<div class="lib-row ${g.hidden ? 'is-hidden' : ''}">
          <button class="linkbtn n" data-details="${g.appid}">${esc(g.name || 'App ' + g.appid)}</button>
          ${g.modded ? '<span class="tag mod">🔧</span>' : '<span></span>'}
          <span class="v">${g.minutes ? fmt(hrsOf(g.minutes)) + 'h' : 'never played'}</span>
          ${P.self ? `<button class="eye" data-hide="${g.appid}" data-on="${g.hidden ? 0 : 1}" title="${g.hidden ? 'Show on the site' : 'Hide from the site'}">${g.hidden ? '🙈 Hidden' : '👁 Shown'}</button>` : ''}
        </div>`).join('') || '<p class="hint">Nothing matches.</p>'}</div>
      ${list.length > state.libShow ? `<button class="btn ghost sm" data-libmore style="margin-top:12px">Show more (${list.length - state.libShow} left)</button>` : ''}
    </div>`;
  }
  async function toggleHidden(appid, hide) {
    const P = state.profiles[ME]; if (!P) return;
    const g = P.library.find(x => x.appid === appid); if (!g) return;
    g.hidden = hide;
    // keep group views in sync straight away
    LIB[ME] = LIB[ME] || {};
    if (hide) delete LIB[ME][appid];
    else LIB[ME][appid] = { h: hrsOf(g.minutes), h2w: hrsOf(g.minutes_2w) };
    render();
    if (!LIVE) { const h = new Set(store.get('hidden', [])); hide ? h.add(appid) : h.delete(appid); store.set('hidden', [...h]); return; }
    try { await API.call('/api/profile/hidden', { method: 'POST', body: JSON.stringify({ appid, hidden: hide }) }); }
    catch { toast('Could not save that. Try again.'); }
  }

  /* ---------- router ---------- */
  function render() {
    const v = state.view;
    $$('.tabs a').forEach(a => a.classList.toggle('active', a.dataset.view === v));
    $('#crewPanel').hidden = !(v === 'tonight' || v === 'shuffle');
    ({ tonight: renderTonight, shuffle: renderShuffle, discovery: renderDiscovery, pitches: renderPitches, news: renderNews, leaderboard: renderLb, profile: renderProfile })[v]();
    renderCur();
  }
  // The address bar always stays on the bare site; the current tab lives in sessionStorage
  function go(view, opts = {}) {
    state.view = VIEWS.includes(view) ? view : 'tonight';
    if (state.view === 'profile') state.profileId = opts.profile || state.profileId || ME;
    try { sessionStorage.setItem('bg:view', JSON.stringify({ v: state.view, p: state.profileId })); } catch {}
    closeModal(); render(); window.scrollTo({ top: 0 });
  }
  function startView() {
    const h = location.hash.slice(1);
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    if (VIEWS.includes(h)) return go(h);
    try { const s = JSON.parse(sessionStorage.getItem('bg:view') || 'null'); if (s) return go(s.v, { profile: s.p }); } catch {}
    go('tonight');
  }

  /* ---------- events ---------- */
  document.addEventListener('click', async e => {
    if (e.target.id === 'modal') return closeModal();
    const nav = e.target.closest('[data-view]');
    if (nav && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setMenu(false); go(nav.dataset.view, { profile: nav.dataset.profile }); return; }
    if (e.target.closest('#menuBtn')) { setMenu(!$('.top').classList.contains('menu-open')); return; }
    if ($('.top').classList.contains('menu-open') && !e.target.closest('.top')) setMenu(false);
    if ($('.top').classList.contains('menu-open') && !e.target.closest('.top')) setMenu(false);
    if (e.target.closest('#themeBtn')) { toggleTheme(); return; }
    const det = e.target.closest('[data-details]');
    if (det && !e.target.closest('[data-pitch]')) { openDetails(+det.dataset.details); return; }
    const t = e.target.closest('button,[data-close]');
    if (!t) return;
    const d = t.dataset;

    if (d.id && t.classList.contains('chip') && t.closest('#crew')) {
      state.on.has(d.id) ? state.on.delete(d.id) : state.on.add(d.id);
      store.set(LIVE ? 'on-live' : 'on', [...state.on]); renderCrew(); render(); return;
    }
    if (d.crew) {
      state.on = new Set(d.crew === 'all' ? CREW.map(c => c.id) : d.crew === 'core' ? CORE : d.crew === 'online' ? [ME, ...CREW.filter(c => isOnline(c.id)).map(c => c.id)] : []);
      store.set(LIVE ? 'on-live' : 'on', [...state.on]); renderCrew(); render(); return;
    }
    if (d.cap) {
      const [scope, v] = d.cap.split(':'), obj = scope === 'sh' ? state.sh : scope === 'disc' ? state.disc : state.tf;
      obj.cap = obj.cap === +v ? 0 : +v; if (scope === 'sh') store.set('shuffle', state.sh); render(); return;
    }
    if (d.tf) { state.tf[d.tf] = !state.tf[d.tf]; render(); return; }
    if (d.pool) { state.sh.pool = d.pool; store.set('shuffle', state.sh); render(); return; }
    if (d.sh) { state.sh[d.sh] = !state.sh[d.sh]; store.set('shuffle', state.sh); render(); return; }
    if (t.id === 'rollBtn') { roll(); return; }
    if (d.act === 'reload') { location.reload(); return; }
    if (d.act === 'yes' && state.current) {
      if (state.history[0]) state.history[0].verdict = '👍 playing';
      const gname = esc(gameById[state.current].name);
      if (LIVE) {
        try { const r = await API.call('/api/announce', { method: 'POST', body: JSON.stringify({ appid: state.current, players: people() }) });
          toast(r.posted ? `Posted to <b>#game-night</b>: tonight's game is <b>${gname}</b> 🎲` : `Tonight's game: <b>${gname}</b> 🎲`); }
        catch { toast('Could not post to Discord.'); }
      } else toast(`Posted to <b>#game-night</b>: the group rolled <b>${gname}</b> 🎲 (mock)`);
      render(); return;
    }
    if (d.act === 'nah' && state.current) {
      state.hidden.add(state.current);
      if (state.history[0]) state.history[0].verdict = '👎 nah';
      roll(); return;
    }
    if (d.act === 'unhide') { state.hidden.clear(); render(); return; }
    if (d.act === 'logout') { API.logout(); return; }
    if (d.pitch) { openPitch(d.pitch); return; }
    if (d.vote) {
      const p = state.pitches.find(x => x.id === d.vote);
      if (p) {
        p.votes = p.votes.includes(ME) ? p.votes.filter(v => v !== ME) : [...p.votes, ME]; render();
        if (LIVE) API.call(`/api/pitches/${p.id}/vote`, { method: 'POST' }).catch(() => { toast('Vote failed.'); loadPitches(); });
        else store.set('pitches', state.pitches);
      }
      return;
    }
    if (d.delpitch) {
      try { await API.call(`/api/pitches/${d.delpitch}`, { method: 'DELETE' }); state.pitches = state.pitches.filter(p => p.id !== d.delpitch); render(); }
      catch { toast('Could not delete that pitch.'); }
      return;
    }
    if (d.newsmine !== undefined) { state.newsMine = d.newsmine === '1'; state.news = LIVE ? null : state.news; render(); return; }
    if ('newspatch' in d) { state.newsPatch = !state.newsPatch; render(); return; }
    if (d.lb) { state.lb = d.lb; render(); return; }
    if (d.lbv) { state.lbView = d.lbv; render(); return; }
    if (d.cur) { state.cur = d.cur; store.set('cur', d.cur); render(); if (draft) renderModal(); return; }
    if (d.dsrc) { state.disc.src = d.dsrc; render(); return; }
    if (d.dtf) { state.disc[d.dtf] = !state.disc[d.dtf]; render(); return; }
    if ('close' in d) { closeModal(); return; }
    if ('to' in d && draft) {
      if (!d.to) draft.to = [];
      else draft.to = draft.to.includes(d.to) ? draft.to.filter(x => x !== d.to) : [...draft.to, d.to];
      draft.note = ($('#note') || {}).value || draft.note;
      renderModal(); return;
    }
    if (t.id === 'sendPitch' && draft) {
      const g = gameById[draft.game];
      if (LIVE) {
        t.disabled = true; t.textContent = 'Sending…';
        try {
          const r = await API.call('/api/pitches', { method: 'POST', body: JSON.stringify({ appid: draft.game, to: draft.to, note: draft.note.trim() }) });
          closeModal();
          toast(r.posted ? `Pitched <b>${esc(g.name)}</b> in <b>#game-night</b>` : `Pitched <b>${esc(g.name)}</b>`);
          state.pitchesLoaded = false; if (state.view === 'pitches') render();
        } catch (err) { toast(esc((err.body && err.body.message) || 'Could not send that pitch.')); t.disabled = false; t.textContent = 'Send pitch'; }
        return;
      }
      state.pitches.unshift({ id: 'p' + Date.now(), game: draft.game, by: ME, to: draft.to, note: draft.note.trim(), votes: [ME], at: Date.now() });
      store.set('pitches', state.pitches);
      closeModal();
      toast(`Pitched <b>${esc(g.name)}</b> to <b>#game-night</b> (mock)`);
      if (state.view === 'pitches') render();
      return;
    }
    if (t.id === 'steamLinkBtn') {
      if (!LIVE) { toast('Steam linking works once the backend is connected.'); return; }
      const input = $('#steamInput').value.trim();
      if (!input) return toast('Paste your Steam profile link first.');
      t.disabled = true; t.textContent = 'Linking…';
      try { await API.call('/api/steam/link', { method: 'POST', body: JSON.stringify({ input }) }); location.reload(); }
      catch (err) { toast(esc((err.body && err.body.message) || 'Could not link that Steam account.')); t.disabled = false; t.textContent = 'Link Steam'; }
      return;
    }
    if (d.hide) { toggleHidden(+d.hide, d.on === '1'); return; }
    if (d.libf) { state.libFilter = d.libf; state.libShow = 60; render(); return; }
    if ('libmore' in d) { state.libShow += 120; render(); return; }
    if (d.cmpwith) { state.cmp = [ME, d.cmpwith]; state.lbView = 'compare'; go('leaderboard'); return; }
    if (t.id === 'unlinkBtn') {
      if (!confirmUnlink) { confirmUnlink = true; t.textContent = 'Tap again to unlink'; setTimeout(() => { confirmUnlink = false; if (t.isConnected) t.textContent = 'Unlink'; }, 4000); return; }
      if (!LIVE) { toast('Unlinking works once the backend is connected.'); return; }
      try { await API.call('/api/steam/link', { method: 'DELETE' }); location.reload(); } catch { toast('Could not unlink. Try again.'); }
      return;
    }
    if (t.id === 'resyncBtn') {
      if (!LIVE) { toast('Resync works once the backend is connected.'); return; }
      t.disabled = true; t.textContent = 'Syncing…';
      try { await API.call('/api/steam/sync', { method: 'POST' }); location.reload(); }
      catch (err) { toast('Sync failed. Try again in a minute.'); t.disabled = false; t.textContent = 'Resync'; }
    }
  });

  document.addEventListener('change', e => {
    if (e.target.dataset.cmp !== undefined) { state.cmp[+e.target.dataset.cmp] = e.target.value; render(); }
    if (e.target.dataset.statpick) { state.statPick[e.target.dataset.statpick] = +e.target.value; render(); }
    if (e.target.dataset.setting) saveSetting(e.target.dataset.setting, e.target.checked);
  });
  document.addEventListener('input', e => {
    if (e.target.id === 'q') {
      state.query = e.target.value; $('#results').innerHTML = resultsHtml();
      const q = state.query.trim().toLowerCase();
      if (LIVE && q.length >= 2) {
        clearTimeout(searchT);
        searchT = setTimeout(async () => {
          const seq = ++searchSeq;
          try {
            const r = await API.call('/api/search?q=' + encodeURIComponent(q));
            if (seq !== searchSeq) return;
            mergeGames(r.games); state.searchQ = q; state.searchIds = r.results;
          } catch { state.searchQ = q; state.searchIds = []; }
          if ($('#results') && state.query.trim().toLowerCase() === q) $('#results').innerHTML = resultsHtml();
        }, 350);
      }
    }
    if (e.target.id === 'libQ') {
      state.libQuery = e.target.value; state.libShow = 60;
      const pos = e.target.selectionStart; render();
      const el = $('#libQ'); if (el) { el.focus(); el.setSelectionRange(pos, pos); }
    }
    if (e.target.id === 'note' && draft) { draft.note = e.target.value; $('#dpreview').innerHTML = discordPreview(); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && $('.top').classList.contains('menu-open')) { setMenu(false); return; }
    if (e.key === 'Escape' && !$('#modal').hidden) { closeModal(); return; }
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (e.code === 'Space' && state.view === 'shuffle' && !typing && $('#modal').hidden) { e.preventDefault(); roll(); }
  });

  /* ---------- notifications ---------- */
  const notif = { items: [], unread: 0, open: false, loaded: false };
  function mockNotifs() {
    const read = new Set(store.get('notif-read', []));
    const g = id => gameById[id] || {};
    const list = [
      { id: 'm1', kind: 'pitch', from: 'bradley', appid: 1966720, pitch: (state.pitches[0] || {}).id, note: 'tonight? 👀', at: Date.now() - 25 * 60e3 },
      { id: 'm2', kind: 'vote', from: 'aoife', appid: 553850, pitch: (state.pitches[1] || {}).id, at: Date.now() - 3 * 3600e3 },
      { id: 'm3', kind: 'playing', from: 'conor', appid: 550, at: Date.now() - 26 * 3600e3 },
    ].map(n => ({ ...n, game: g(n.appid).name || 'a game', read: read.has(n.id) }));
    return { items: list, unread: list.filter(n => !n.read).length };
  }
  async function loadNotifs() {
    try {
      const r = LIVE ? await API.call('/api/notifications') : mockNotifs();
      notif.items = r.items; notif.unread = r.unread; notif.loaded = true;
      (r.items || []).forEach(n => { if (n.appid && n.img && !gameById[n.appid]) mergeGames({ [n.appid]: { name: n.game, header: n.img } }); });
    } catch { /* bell just stays as it was */ }
    renderBell();
  }
  function notifText(n) {
    const who = `<b>${esc((crewById[n.from] || {}).name || 'Someone')}</b>`, game = `<b>${esc(n.game || 'a game')}</b>`;
    if (n.kind === 'pitch') return `${who} pitched ${game} to you`;
    if (n.kind === 'vote') return `${who} voted for your pitch of ${game}`;
    if (n.kind === 'playing') return `${who} says you’re playing ${game}`;
    return `${who} · ${game}`;
  }
  const NOTIF_IC = { pitch: '📣', vote: '▲', playing: '🎮' };
  function renderBell() {
    const b = $('#bellBadge'); if (!b) return;
    b.hidden = !notif.unread; b.textContent = notif.unread > 9 ? '9+' : notif.unread;
    $('#bellBtn').classList.toggle('has', notif.unread > 0);
    $('#bellBtn').title = notif.unread ? `${notif.unread} new notification${notif.unread > 1 ? 's' : ''}` : 'Notifications';
    const panel = $('#notifPanel');
    panel.hidden = !notif.open; $('#bellBtn').setAttribute('aria-expanded', String(notif.open));
    if (!notif.open) return;
    panel.innerHTML = `<div class="np-head"><b>Notifications</b>${notif.unread ? '<button class="linkbtn" data-notif-all>Mark all read</button>' : ''}</div>
      ${!notif.loaded ? '<p class="hint np-empty">Loading…</p>' : !notif.items.length ? '<p class="hint np-empty">Nothing yet. When someone pitches you a game or votes on your pitch, it shows up here.</p>' :
        `<div class="np-list">${notif.items.map(n => `<button class="np-item ${n.read ? '' : 'unread'}" data-notif="${n.id}">
          <span class="np-av">${crewById[n.from] ? av(n.from) : ''}<i>${NOTIF_IC[n.kind] || '•'}</i></span>
          <span class="np-body"><span class="np-text">${notifText(n)}</span>${n.note ? `<span class="np-note">“${esc(n.note)}”</span>` : ''}<span class="np-when">${ago(n.at)}</span></span>
        </button>`).join('')}</div>`}`;
  }
  async function markRead(ids) {
    notif.items.forEach(n => { if (!ids || ids.includes(n.id)) n.read = true; });
    notif.unread = notif.items.filter(n => !n.read).length; renderBell();
    if (!LIVE) { store.set('notif-read', notif.items.filter(n => n.read).map(n => n.id)); return; }
    try { await API.call('/api/notifications/read', { method: 'POST', body: JSON.stringify(ids ? { ids } : {}) }); } catch { }
  }
  function openNotif(n) {
    markRead([n.id]); notif.open = false; renderBell();
    if ((n.kind === 'pitch' || n.kind === 'vote') && n.pitch) {
      state.flashPitch = n.pitch; go('pitches');
      setTimeout(() => { const el = document.getElementById('pitch-' + n.pitch); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 250);
      setTimeout(() => { state.flashPitch = null; }, 3000);
    } else if (n.appid && gameById[n.appid]) openDetails(n.appid);
  }
  document.addEventListener('click', e => {
    if (e.target.closest('#bellBtn')) { notif.open = !notif.open; if (notif.open) { setMenu(false); loadNotifs(); } renderBell(); return; }
    if (e.target.closest('[data-notif-all]')) { markRead(null); return; }
    const it = e.target.closest('[data-notif]');
    if (it) { const n = notif.items.find(x => x.id === it.dataset.notif); if (n) openNotif(n); return; }
    if (notif.open && !e.target.closest('#bellwrap')) { notif.open = false; renderBell(); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && notif.open) { notif.open = false; renderBell(); } });

  /* ---------- init ---------- */
  if (LIVE) {
    $('.mockbar').hidden = true;
    const core = $('[data-crew=core]'); if (core) core.textContent = 'Just me';
  }
  $('#me').innerHTML = `<button class="me-btn" data-view="profile" data-profile="${ME}" title="Your profile">${av(ME)}<span>${esc(crewById[ME].name)}<small>Your profile</small></span></button>`;
  mergeGames(D.pitchGames);
  if (LIVE && D.PITCHES) { state.pitches = D.PITCHES; state.pitchesLoaded = true; }
  renderTheme();
  renderNotice();
  if (!$('[data-crew=online]')) $('.crew-actions').insertAdjacentHTML('afterbegin', '<button class="linkbtn" data-crew="online" hidden>Who\'s online</button>');
  renderCrew();
  startView();
  loadPresence();
  if (LIVE) setInterval(loadPresence, 60_000);
  loadNotifs();
  if (LIVE) setInterval(() => { if (!document.hidden) loadNotifs(); }, 60_000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { loadPresence(); if (LIVE) loadNotifs(); } });
})();
