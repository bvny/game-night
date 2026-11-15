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
  const VIEWS = ['tonight', 'shuffle', 'discovery', 'pitches', 'leaderboard'];
  const SYM = { EUR: '€', GBP: '£', USD: '$' };
  const CC = { EUR: 'ie', GBP: 'gb', USD: 'us' };
  const firstOther = (CREW.find(c => c.id !== ME && !c.private) || {}).id;

  const savedOn = store.get(LIVE ? 'on-live' : 'on', CORE).filter(id => crewById[id]);
  const state = {
    view: 'tonight',
    on: new Set(savedOn.length ? savedOn : CORE),
    tf: { multi: true, coop: false, pvp: false, fits: false, cheap: false },
    sh: Object.assign({ pool: 'all', coop: false, pvp: false, free: false, fits: true }, store.get('shuffle', {})),
    hidden: new Set(), history: [], current: null, rolling: false,
    pitches: LIVE ? [] : store.get('pitches', D.PITCHES || []),
    query: '', lb: 'recent', lbView: 'rank', cmp: [ME, firstOther],
    cur: store.get('cur', 'EUR'),
    disc: { src: 'played', unowned: true, multi: true, cheap: false },
  };
  let draft = null;
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

  const img = g => `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.id}/header.jpg`;
  const storeUrl = g => `https://store.steampowered.com/app/${g.id}/`;
  const ggUrl = g => `https://gg.deals/steam/app/${g.id}/`;
  const money = v => SYM[state.cur] + v.toFixed(2);
  const P = g => (g.prices && g.prices[state.cur]) || { base: 0, steam: 0, key: null };
  const hasPrice = g => g.f2p || P(g).steam > 0;
  const price = g => g.f2p ? 'Free' : hasPrice(g) ? money(P(g).steam) : '—';
  const cheap = g => g.f2p || (hasPrice(g) && P(g).steam < 20);
  const fmt = n => (Math.round(n * 10) / 10).toLocaleString();

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
  const art = (g, details = false) => `<div class="art ${details ? 'clickable' : ''}" ${details ? `data-details="${g.id}"` : ''}><img src="${img(g)}" alt="" loading="lazy" onerror="this.parentNode.classList.add('noimg')"><span class="fallback">${esc(g.name)}</span>${details ? '<span class="play">▶</span>' : ''}</div>`;
  const tags = g => `<div class="tags">${g.tags.map(t => `<span class="tag ${t === 'Co-op' ? 'coop' : t === 'PvP' ? 'pvp' : ''}">${esc(t)}</span>`).join('')}</div>`;
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

  function renderCur() {
    $('#cur').innerHTML = Object.entries(SYM).map(([k, s]) => `<button class="${state.cur === k ? 'on' : ''}" data-cur="${k}" title="${k}">${s}</button>`).join('');
  }

  /* ---------- crew ---------- */
  function renderCrew() {
    $('#crew').innerHTML = CREW.map(c =>
      `<button class="chip ${state.on.has(c.id) ? 'on' : ''}" data-id="${c.id}">${av(c.id, 'sm')}${esc(c.name)}${c.private ? `<span class="lock">🔒 ${c.unlinked ? 'no Steam' : 'private'}</span>` : ''}</button>`
    ).join('');
  }

  /* ---------- game details: trailer + description ---------- */
  const detailCache = {};
  function getDetails(g) {
    const fallback = { description: g.desc || '', genres: [], categories: [], movie: null };
    if (!LIVE || g.disc) return Promise.resolve(fallback);
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
  const mediaHtml = g => `<div class="media" data-media>${art(g)}${LIVE && !g.disc ? '' : '<span class="media-note">▶ Trailers play once Steam is connected</span>'}</div>`;

  function openDetails(id) {
    const g = gameById[id]; if (!g) return;
    const s = status(g);
    $('#modal').innerHTML = `<div class="sheet wide" role="dialog" aria-label="${esc(g.name)}">${mediaHtml(g)}<div class="in">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px"><h2 style="font-size:30px">${esc(g.name)}</h2><button class="linkbtn" data-close>Close ✕</button></div>
      <div class="tagrow">${tags(g)}<span class="tags" data-stags></span></div>
      <p class="desc" data-desc>${esc(g.desc || 'Loading…')}</p>
      <div class="meta"><span>${playersTxt(g)}</span><span>${ownCount(g) ? `${ownCount(g)} of the crew own it` : 'Nobody in the crew owns it'}</span></div>
      ${s.owners.length ? `<div><span class="stack">${s.owners.map(p => av(p, 'sm')).join('')}</span></div>` : ''}
      ${priceBlock(g)}
      <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap"><a class="btn ghost" href="${storeUrl(g)}" target="_blank" rel="noopener">Steam page ↗</a><button class="btn blurple" data-pitch="${g.id}">Pitch it</button></div>
    </div></div>`;
    $('#modal').hidden = false;
    hydrate(g, $('#modal .sheet'));
  }

  /* ---------- tonight ---------- */
  function renderTonight() {
    const ppl = people(), v = $('#view');
    if (!ppl.length) { v.innerHTML = `<div class="empty">Tick who's on tonight to see what you can play.</div>`; return; }
    const f = state.tf;
    const pass = (g, s) => (!f.multi || isMulti(g)) && (!f.coop || g.coop) && (!f.pvp || g.pvp) && (!f.fits || s.fits) && (!f.cheap || cheap(g));
    const ready = [], almost = [], free = [];
    GAMES.forEach(g => {
      if (g.disc) return;
      const s = status(g, ppl); if (!pass(g, s)) return;
      const item = { g, s };
      if (g.f2p) { if (s.owners.length) free.push(item); }
      else if (!s.missing.length) { if (s.owners.length || !LIVE) ready.push(item); }
      else if (s.missing.length <= 2 && s.owners.length) almost.push(item);
    });
    ready.sort((a, b) => b.s.groupH - a.s.groupH);
    almost.sort((a, b) => a.s.missing.length - b.s.missing.length || P(a.g).steam - P(b.g).steam);
    free.sort((a, b) => b.s.owners.length - a.s.owners.length || b.s.groupH - a.s.groupH);
    const cap = list => list.slice(0, 48);

    const fl = [['multi', 'Multiplayer only'], ['coop', 'Co-op'], ['pvp', 'PvP'], ['fits', ppl.length > 1 ? `Fits all ${ppl.length} of us` : 'Fits the group'], ['cheap', `Under ${SYM[state.cur]}20`]];
    const pending = LIVE && D.pendingInfo ? `<p class="hint" style="margin:0 0 12px">⏳ Still fetching Steam info (co-op/PvP, prices) for ${D.pendingInfo} games. Refresh in a minute.</p>` : '';
    v.innerHTML = pending +
      `<div class="filters">${fl.map(([k, l]) => `<button class="toggle ${f[k] ? 'on' : ''}" data-tf="${k}">${l}</button>`).join('')}</div>` +
      section('Everyone owns', cap(ready), ready.length, 'Ready to launch right now.', 'ready') +
      section('Almost', cap(almost), almost.length, 'Only 1 or 2 people need to buy it.', 'almost') +
      section('Free to play', cap(free), free.length, 'Nobody has to spend a cent.', 'free');
  }
  function section(title, items, total, sub, kind) {
    return `<div class="section-head"><h2>${title}</h2><span class="count">${total}</span><p>${sub}</p></div>` +
      (items.length ? `<div class="grid">${items.map(i => card(i.g, i.s, kind)).join('')}</div>` : `<div class="empty">Nothing here with these filters.</div>`);
  }
  function card(g, s, kind) {
    return `<article class="gcard ${s.fits ? '' : 'dim'}">${art(g, true)}
      <div class="body"><h4>${esc(g.name)}</h4>${tags(g)}
        <div class="meta"><span>${playersTxt(g)}${s.fits ? '' : ' · too many of you'}</span><span>${s.groupH ? fmt(s.groupH) + 'h together' : ''}</span></div>
        ${kind === 'almost' ? needsHtml(s) + priceBlock(g) : ''}
        ${s.owners.length ? `<div class="meta"><span class="stack">${s.owners.slice(0, 10).map(p => av(p, 'sm')).join('')}</span><span>${kind === 'free' ? s.owners.length + ' have it' : ''}</span></div>` : ''}
        ${unknownHtml(s)}
      </div>
      <div class="actions"><button class="btn sm ghost" data-pitch="${g.id}">Pitch it</button><a href="${storeUrl(g)}" target="_blank" rel="noopener">Steam ↗</a></div>
    </article>`;
  }

  /* ---------- shuffle ---------- */
  function pool() {
    const ppl = people(), o = state.sh;
    return GAMES.filter(g => {
      if (state.hidden.has(g.id)) return false;
      if (knownSingle(g)) return false;
      const s = status(g, ppl);
      const owned = s.owners.length > 0;
      if (o.pool === 'all' && (s.missing.length || !(owned || (g.f2p && !g.disc)))) return false;
      if (o.pool === 'one' && (s.missing.length > 1 || !owned)) return false;
      if (o.coop && !g.coop) return false;
      if (o.pvp && !g.pvp) return false;
      if (o.free && !g.f2p) return false;
      if (o.fits && !s.fits) return false;
      return true;
    });
  }
  function renderShuffle() {
    const p = pool(), o = state.sh, g = state.current && gameById[state.current];
    const pools = [['all', 'Everyone owns'], ['one', 'Missing ≤1'], ['any', 'Anything']];
    const locks = [['fits', 'Fits everyone on'], ['coop', 'Co-op only'], ['pvp', 'PvP only'], ['free', 'Free only']];
    $('#view').innerHTML = `<div class="shuffle"><div>
      ${g ? bigCard(g) : `<div class="bigcard"><div class="art noimg"><span class="fallback" style="font-size:40px">🎲</span></div>
        <div class="body"><h2>Can't decide?</h2><p class="desc">Roll a random game from what tonight's crew can play. Lock filters on the right and keep rolling until something sticks. Each roll shows the trailer and what the game's about.</p></div></div>`}
      <div class="roll-actions">
        <button class="btn big" id="rollBtn">ROLL 🎲</button><span>or press <span class="kbd">SPACE</span></span>
        ${g ? `<button class="btn blurple" data-act="yes">👍 We're playing this</button><button class="btn ghost" data-act="nah" title="Hide it for this session">👎 Nah</button>` : ''}
      </div></div>
      <aside class="side">
        <div class="panel"><h3>Pool</h3>
          <div class="seg">${pools.map(([k, l]) => `<button class="${o.pool === k ? 'on' : ''}" data-pool="${k}">${l}</button>`).join('')}</div>
          <div class="poolcount">${p.length} game${p.length === 1 ? '' : 's'} in the pool${state.hidden.size ? ` · ${state.hidden.size} hidden · <button class="linkbtn" data-act="unhide">reset</button>` : ''}</div>
        </div>
        <div class="panel"><h3>Locks</h3><div class="locks">
          ${locks.map(([k, l]) => `<button class="lockrow ${o[k] ? 'on' : ''}" data-sh="${k}">${l}<span>${o[k] ? '🔒' : '🔓'}</span></button>`).join('')}
        </div></div>
        ${state.history.length ? `<div class="panel"><h3>Recent rolls</h3><div class="history">${state.history.map(h => `<div><span>${esc(gameById[h.id].name)}</span><span class="x">${h.verdict || ''}</span></div>`).join('')}</div></div>` : ''}
      </aside></div>`;
    if (g && !state.rolling) hydrate(g, $('#bigcard'));
  }
  function bigCard(g) {
    const s = status(g);
    return `<div class="bigcard" id="bigcard">${mediaHtml(g)}<div class="body">
      <h2 id="bigTitle">${esc(g.name)}</h2>
      <div class="tagrow" style="margin-top:12px">${tags(g)}<span class="tags" data-stags></span></div>
      <p class="desc" data-desc>${esc(g.desc || '')}</p>
      <div class="big-row">
        <div class="stat"><span class="label">Players</span><b>${g.max ? 'up to ' + g.max : isMulti(g) ? 'multi' : '?'}</b></div>
        <div class="stat"><span class="label">Group hours</span><b>${fmt(s.groupH)}h</b></div>
        <div class="stat"><span class="label">Owned by</span><b class="stack">${s.owners.slice(0, 10).map(p => av(p, 'sm')).join('') || '—'}</b></div>
      </div>
      <div style="margin-top:14px">${priceBlock(g)}</div>
      ${s.missing.length ? `<div style="margin-top:10px">${needsHtml(s)}</div>` : ''}
      ${s.unknown.length ? `<div style="margin-top:8px">${unknownHtml(s)}</div>` : ''}
      <div style="margin-top:12px;font-size:14px"><a href="${storeUrl(g)}" target="_blank" rel="noopener">View on Steam ↗</a> · <button class="linkbtn" data-pitch="${g.id}">Pitch it</button></div>
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
      if (d.multi && !isMulti(g)) return false;
      if (d.cheap && !cheap(g)) return false;
      return true;
    });
    const fl = [['unowned', 'Nobody owns it yet'], ['multi', 'Multiplayer only'], ['cheap', `Under ${SYM[state.cur]}20`]];
    const when = state.chartsUpdated ? ` · updated ${ago(state.chartsUpdated)}` : '';
    $('#view').innerHTML = `
      <div class="section-head" style="margin-top:0"><h2>Discovery</h2><span class="count">${list.length}</span><p>Steam's live charts${LIVE ? when : ''}. Click a game for the trailer.</p></div>
      <div class="disc-bar">
        <div class="seg" style="min-width:${SRC.length * 112}px">${SRC.map(([k, l]) => `<button class="${d.src === k ? 'on' : ''}" data-dsrc="${k}">${l}</button>`).join('')}</div>
        <div class="filters">${fl.map(([k, l]) => `<button class="toggle ${d[k] ? 'on' : ''}" data-dtf="${k}">${l}</button>`).join('')}</div>
      </div>
      ${list.length ? `<div class="grid" style="margin-top:20px">${list.map(discCard).join('')}</div>`
        : `<div class="empty" style="margin-top:20px">${all.length ? 'Nothing matches. Try turning a filter off.' : 'No chart data yet. Check back in a few minutes.'}</div>`}
      <p class="hint" style="margin-top:20px">${all.length - list.length > 0 ? `${all.length - list.length} more hidden by filters. ` : ''}Charts refresh daily from Steam. Keyshop prices via <a href="https://gg.deals" target="_blank" rel="noopener">GG.deals</a>.</p>`;
  }
  function discCard({ g, rank, value }) {
    const d = state.disc, n = ownCount(g);
    const badge = d.src === 'sale' ? (g.sale ? `-${g.sale}%` : `#${rank}`) : `#${rank}`;
    return `<article class="gcard"><div style="position:relative">${art(g, true)}<span class="rank">${badge}</span></div>
      <div class="body"><h4>${esc(g.name)}</h4>${tags(g)}
        <p class="desc sm">${esc((g.desc || '').slice(0, 160))}${(g.desc || '').length > 160 ? '…' : ''}</p>
        <div class="meta"><span>${value ? `🔥 ${fmtNum(value)} peak players` : playersTxt(g)}</span><span>${n ? n + ' of the crew own it' : 'Nobody owns it'}</span></div>
        ${priceBlock(g)}
      </div>
      <div class="actions"><button class="btn sm ghost" data-pitch="${g.id}">Pitch it</button><button class="linkbtn" data-details="${g.id}">▶ Trailer &amp; details</button></div>
    </article>`;
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
    return res.map(g => `<div class="result">${art(g, true)}<div><b>${esc(g.name)}</b><small>${ownCount(g)} of the crew own it</small>${priceBlock(g)}</div><button class="btn sm" data-pitch="${g.id}">Pitch it</button></div>`).join('');
  }
  function pitchHtml(p) {
    const g = gameById[p.game], mine = p.votes.includes(ME);
    const to = p.to.length ? p.to.filter(t => crewById[t]).map(t => '@' + esc(crewById[t].name)).join(' ') : 'everyone';
    return `<div class="pitch">
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
  function rankingsHtml() {
    const pub = CREW.filter(c => !c.private), mode = state.lb;
    const rows = pub.map(c => {
      const lib = LIB[c.id] || {}, ids = Object.keys(lib);
      let top = null, topV = 0;
      ids.forEach(id => { const v = mode === 'recent' ? lib[id].h2w : lib[id].h; if (v > topV) { topV = v; top = id; } });
      const val = mode === 'recent' ? ids.reduce((a, id) => a + lib[id].h2w, 0)
        : mode === 'all' ? ids.reduce((a, id) => a + lib[id].h, 0) : ids.length;
      return { c, val: Math.round(val * 10) / 10, top, topV };
    }).sort((a, b) => b.val - a.val);
    const max = rows[0] ? rows[0].val || 1 : 1;
    const unit = { recent: 'hrs · 2 weeks', all: 'hrs · all time', owned: 'games' }[mode];
    const together = GAMES.filter(g => !g.disc).map(g => {
      const pl = pub.filter(c => owns(c.id, g.id));
      return { g, n: pl.length, h: pl.reduce((a, c) => a + LIB[c.id][g.id].h, 0) };
    }).filter(x => x.n >= 2 && x.h > 0).sort((a, b) => b.h - a.h).slice(0, 8);
    const modes = [['recent', 'Last 2 weeks'], ['all', 'All time'], ['owned', 'Games owned']];
    const priv = CREW.filter(c => c.private).map(c => c.name).join(', ');
    const gname = id => (gameById[id] || {}).name || 'something';
    return `<div class="lb-layout"><div>
        <div class="filters" style="margin-bottom:16px">${modes.map(([k, l]) => `<button class="toggle ${mode === k ? 'on' : ''}" data-lb="${k}">${l}</button>`).join('')}</div>
        ${rows.map((r, i) => `<div class="lbrow ${i === 0 ? 'gold' : ''}">
          <div class="rank-b r${i < 3 ? i + 1 : 0}">${i + 1}</div>${av(r.c.id, 'lg')}
          <div class="who"><b>${esc(r.c.name)}</b>${mode !== 'owned' && r.top && r.topV ? `<div class="fav">Mostly ${esc(gname(r.top))} · ${fmt(r.topV)}h</div>` : ''}
            <div class="bar"><i style="width:${(r.val / max) * 100}%"></i></div></div>
          <div class="val">${fmt(r.val)}<small>${unit}</small></div></div>`).join('')}
        <p class="hint">${priv ? esc(priv) + ' not shown (Steam private or not linked). ' : ''}Nightly snapshots will add weekly and monthly boards.</p>
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
    ];
    const both = Object.keys(la).filter(id => lb[id] && gameById[id]).map(id => ({ g: gameById[id], a: la[id].h, b: lb[id].h })).sort((x, y) => (y.a + y.b) - (x.a + x.b));
    const only = (l1, l2) => Object.keys(l1).filter(id => !l2[id] && gameById[id]).map(id => ({ g: gameById[id], h: l1[id].h })).sort((x, y) => y.h - x.h).slice(0, 6);
    const onlyA = only(la, lb), onlyB = only(lb, la);
    const top = both.slice(0, 10), maxH = Math.max(1, ...top.flatMap(x => [x.a, x.b]));
    const sel = (idx, cur) => `<select data-cmp="${idx}">${pub.map(c => `<option value="${c.id}" ${c.id === cur ? 'selected' : ''}>${esc(c.name)}${c.id === ME ? ' (you)' : ''}</option>`).join('')}</select>`;
    const onlyList = (list, who) => list.length ? `<ul class="together">${list.map(x => `<li><button class="linkbtn" data-details="${x.g.id}">${esc(x.g.name)}</button><span>${fmt(x.h)}h</span></li>`).join('')}</ul>` : `<p class="hint">Nothing ${esc(who)} has that the other doesn't.</p>`;
    return `<div class="cmp">
      <div class="cmp-head">
        <div class="cmp-side">${av(a, 'xl')}${sel(0, a)}</div>
        <div class="vs">VS</div>
        <div class="cmp-side right">${sel(1, b)}${av(b, 'xl')}</div>
      </div>
      <div class="cmp-stats">${stats.map(([l, x, y]) => { const t = (x + y) || 1; return `<div class="cmp-stat">
        <b class="${x > y ? 'win' : ''}">${fmt(x)}</b>
        <div class="mid"><span class="label">${l}</span><div class="split"><i style="width:${(x / t) * 100}%;background:${ca}"></i><i style="width:${(y / t) * 100}%;background:${cb}"></i></div></div>
        <b class="${y > x ? 'win' : ''}">${fmt(y)}</b></div>`; }).join('')}
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

  /* ---------- router ---------- */
  function render() {
    const v = state.view;
    $$('.tabs a').forEach(a => a.classList.toggle('active', a.dataset.view === v));
    $('#crewPanel').hidden = !(v === 'tonight' || v === 'shuffle');
    ({ tonight: renderTonight, shuffle: renderShuffle, discovery: renderDiscovery, pitches: renderPitches, leaderboard: renderLb })[v]();
    renderCur();
  }
  function route() {
    const h = location.hash.slice(1);
    state.view = VIEWS.includes(h) ? h : 'tonight';
    render();
  }

  /* ---------- events ---------- */
  document.addEventListener('click', async e => {
    if (e.target.id === 'modal') return closeModal();
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
      state.on = new Set(d.crew === 'all' ? CREW.map(c => c.id) : d.crew === 'core' ? CORE : []);
      store.set(LIVE ? 'on-live' : 'on', [...state.on]); renderCrew(); render(); return;
    }
    if (d.tf) { state.tf[d.tf] = !state.tf[d.tf]; render(); return; }
    if (d.pool) { state.sh.pool = d.pool; store.set('shuffle', state.sh); render(); return; }
    if (d.sh) { state.sh[d.sh] = !state.sh[d.sh]; store.set('shuffle', state.sh); render(); return; }
    if (t.id === 'rollBtn') { roll(); return; }
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
      const input = $('#steamInput').value.trim();
      if (!input) return toast('Paste your Steam profile link first.');
      t.disabled = true; t.textContent = 'Linking…';
      try { await API.call('/api/steam/link', { method: 'POST', body: JSON.stringify({ input }) }); location.reload(); }
      catch (err) { toast(esc((err.body && err.body.message) || 'Could not link that Steam account.')); t.disabled = false; t.textContent = 'Link Steam'; }
      return;
    }
    if (t.id === 'resyncBtn') {
      t.disabled = true; t.textContent = 'Syncing…';
      try { await API.call('/api/steam/sync', { method: 'POST' }); location.reload(); }
      catch (err) { toast('Sync failed. Try again in a minute.'); t.disabled = false; t.textContent = 'Resync'; }
    }
  });

  document.addEventListener('change', e => {
    if (e.target.dataset.cmp !== undefined) { state.cmp[+e.target.dataset.cmp] = e.target.value; render(); }
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
    if (e.target.id === 'note' && draft) { draft.note = e.target.value; $('#dpreview').innerHTML = discordPreview(); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#modal').hidden) { closeModal(); return; }
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (e.code === 'Space' && state.view === 'shuffle' && !typing && $('#modal').hidden) { e.preventDefault(); roll(); }
  });
  window.addEventListener('hashchange', route);

  /* ---------- init ---------- */
  if (LIVE) {
    $('.mockbar').textContent = 'BETA · KEYSHOP PRICES COMING SOON';
    const core = $('[data-crew=core]'); if (core) core.textContent = 'Just me';
  }
  $('#me').innerHTML = `${av(ME)}<div>${esc(crewById[ME].name)}<small>${LIVE ? '<button class="linkbtn" data-act="logout">Log out</button>' : 'Discord login (mock)'}</small></div>`;
  renderNotice();
  renderCrew();
  route();
})();
