(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const store = {
    get(k, d) { try { const v = localStorage.getItem('bg:' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('bg:' + k, JSON.stringify(v)); } catch {} },
  };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const D = window.BG_DATA;
  const { CREW, GAMES, LIB, ME } = D;
  const crewById = Object.fromEntries(CREW.map(c => [c.id, c]));
  const gameById = Object.fromEntries(GAMES.map(g => [g.id, g]));
  const CORE = ['james', 'bradley', 'lukas'];
  const VIEWS = ['tonight', 'shuffle', 'discovery', 'pitches', 'leaderboard'];
  const SYM = { EUR: '€', GBP: '£', USD: '$' };

  const state = {
    view: 'tonight',
    on: new Set(store.get('on', CORE)),
    tf: { coop: false, pvp: false, fits: false, cheap: false },
    sh: Object.assign({ pool: 'all', coop: false, pvp: false, free: false, fits: true }, store.get('shuffle', {})),
    hidden: new Set(), history: [], current: null, rolling: false,
    pitches: store.get('pitches', D.PITCHES),
    query: '', lb: 'recent',
    cur: store.get('cur', 'EUR'),
    disc: { src: 'played', unowned: true, multi: true, cheap: false },
  };
  let draft = null;

  /* ---------- helpers ---------- */
  const people = () => [...state.on];
  const owns = (pid, gid) => !!(LIB[pid] && LIB[pid][gid]);
  const hrs = (pid, gid) => (LIB[pid] && LIB[pid][gid] ? LIB[pid][gid].h : 0);
  const ownCount = g => CREW.filter(c => owns(c.id, g.id)).length;
  const names = ids => ids.map(i => crewById[i].name).join(', ');

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
  const money = v => SYM[state.cur] + v.toFixed(2);
  const P = g => g.prices[state.cur];
  const price = g => g.f2p ? 'Free' : money(P(g).steam);
  const cheap = g => g.f2p || P(g).steam < 20;
  const ggUrl = g => `https://gg.deals/steam/app/${g.id}/`;
  function priceBlock(g) {
    if (g.f2p) return `<div class="prices"><span class="p-steam"><small>Steam</small><b>Free</b></span></div>`;
    const p = P(g), steamBest = !p.key || p.steam <= p.key;
    return `<div class="prices">
      <span class="p-steam ${steamBest ? 'best' : ''}"><small>Steam</small>${g.sale ? `<s>${money(p.base)}</s>` : ''}<b>${money(p.steam)}</b>${g.sale ? `<em>-${g.sale}%</em>` : ''}</span>
      ${p.key ? `<a class="p-keys ${steamBest ? '' : 'best'}" href="${ggUrl(g)}" target="_blank" rel="noopener" title="Cheapest keyshop (Loaded, G2A, etc.) via GG.deals"><small>Keys from</small><b>${money(p.key)}</b> ↗</a>` : ''}
    </div>`;
  }
  const av = (pid, cls = '') => { const c = crewById[pid]; return `<span class="av ${cls}" style="background:${c.color}" title="${esc(c.name)}">${esc(c.name[0])}</span>`; };
  const art = g => `<div class="art"><img src="${img(g)}" alt="" loading="lazy" onerror="this.parentNode.classList.add('noimg')"><span class="fallback">${esc(g.name)}</span></div>`;
  const tags = g => `<div class="tags">${g.tags.map(t => `<span class="tag ${t === 'Co-op' ? 'coop' : t === 'PvP' ? 'pvp' : ''}">${esc(t)}</span>`).join('')}</div>`;
  const playersTxt = g => g.max ? `👥 up to ${g.max}` : '👥 lots';
  const needsHtml = s => `<div class="needs"><b>Needs:</b> ${s.missing.map(p => av(p, 'sm') + ' ' + esc(crewById[p].name)).join(' ')}</div>`;
  const unknownHtml = s => s.unknown.length ? `<div class="unknown">? ${esc(names(s.unknown))}: private profile</div>` : '';
  function ago(ts) {
    const m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return 'just now'; if (m < 60) return m + 'm ago';
    const h = Math.round(m / 60); if (h < 24) return h + 'h ago';
    return Math.round(h / 24) + 'd ago';
  }

  let toastT;
  function toast(html) {
    const t = $('#toast'); t.innerHTML = html; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800);
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

  function renderCur() {
    $('#cur').innerHTML = Object.entries(SYM).map(([k, s]) => `<button class="${state.cur === k ? 'on' : ''}" data-cur="${k}" title="${k}">${s}</button>`).join('');
  }

  /* ---------- crew ---------- */
  function renderCrew() {
    $('#crew').innerHTML = CREW.map(c =>
      `<button class="chip ${state.on.has(c.id) ? 'on' : ''}" data-id="${c.id}">${av(c.id, 'sm')}${esc(c.name)}${c.private ? '<span class="lock">🔒 private</span>' : ''}</button>`
    ).join('');
  }

  /* ---------- tonight ---------- */
  function renderTonight() {
    const ppl = people(), v = $('#view');
    if (!ppl.length) { v.innerHTML = `<div class="empty">Tick who's on tonight to see what you can play.</div>`; return; }
    const f = state.tf;
    const pass = (g, s) => (!f.coop || g.coop) && (!f.pvp || g.pvp) && (!f.fits || s.fits) && (!f.cheap || cheap(g));
    const ready = [], almost = [], free = [];
    GAMES.forEach(g => {
      const s = status(g, ppl); if (!pass(g, s)) return;
      const item = { g, s };
      if (g.f2p) free.push(item);
      else if (!s.missing.length) ready.push(item);
      else if (s.missing.length <= 2 && s.owners.length) almost.push(item);
    });
    ready.sort((a, b) => b.s.groupH - a.s.groupH);
    almost.sort((a, b) => a.s.missing.length - b.s.missing.length || P(a.g).steam - P(b.g).steam);
    free.sort((a, b) => b.s.owners.length - a.s.owners.length);

    const fl = [['coop', 'Co-op'], ['pvp', 'PvP'], ['fits', `Fits all ${ppl.length} of us`], ['cheap', `Under ${SYM[state.cur]}20`]];
    v.innerHTML =
      `<div class="filters">${fl.map(([k, l]) => `<button class="toggle ${f[k] ? 'on' : ''}" data-tf="${k}">${l}</button>`).join('')}</div>` +
      section('Everyone owns', ready, 'Ready to launch right now.', 'ready') +
      section('Almost', almost, 'Only 1 or 2 people need to buy it.', 'almost') +
      section('Free to play', free, 'Nobody has to spend a cent.', 'free');
  }
  function section(title, items, sub, kind) {
    return `<div class="section-head"><h2>${title}</h2><span class="count">${items.length}</span><p>${sub}</p></div>` +
      (items.length ? `<div class="grid">${items.map(i => card(i.g, i.s, kind)).join('')}</div>` : `<div class="empty">Nothing here with these filters.</div>`);
  }
  function card(g, s, kind) {
    return `<article class="gcard ${s.fits ? '' : 'dim'}">${art(g)}
      <div class="body"><h4>${esc(g.name)}</h4>${tags(g)}
        <div class="meta"><span>${playersTxt(g)}${s.fits ? '' : ' · too many of you'}</span><span>${s.groupH ? s.groupH + 'h together' : ''}</span></div>
        ${kind === 'almost' ? needsHtml(s) + priceBlock(g) : ''}
        ${s.owners.length ? `<div class="meta"><span class="stack">${s.owners.map(p => av(p, 'sm')).join('')}</span><span>${kind === 'free' ? s.owners.length + ' have played' : ''}</span></div>` : ''}
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
      const s = status(g, ppl);
      if (o.pool === 'all' && s.missing.length) return false;
      if (o.pool === 'one' && s.missing.length > 1) return false;
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
      ${g ? bigCard(g) : `<div class="bigcard"><div class="art noimg"><span class="fallback" style="font-size:30px">🎲</span></div>
        <div class="body"><h2>Can't decide?</h2><p>Roll a random game from what tonight's crew can play. Lock filters on the right and keep rolling until something sticks.</p></div></div>`}
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
  }
  function bigCard(g) {
    const s = status(g);
    return `<div class="bigcard" id="bigcard">${art(g)}<div class="body">
      <h2 id="bigTitle">${esc(g.name)}</h2><div style="margin-top:12px">${tags(g)}</div>
      <div class="big-row">
        <div class="stat"><span class="label">Players</span><b>${g.max ? 'up to ' + g.max : 'lots'}</b></div>
        <div class="stat"><span class="label">Group hours</span><b>${s.groupH}h</b></div>
        <div class="stat"><span class="label">Owned by</span><b class="stack">${s.owners.map(p => av(p, 'sm')).join('') || '—'}</b></div>
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
    if (cardEl) cardEl.classList.add('rolling');
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
  function renderDiscovery() {
    const d = state.disc;
    const srcs = [['played', 'Most played'], ['seller', 'Top sellers'], ['sale', 'On sale']];
    const list = GAMES.filter(g => {
      if (d.src === 'sale' ? !g.sale : !g[d.src]) return false;
      if (d.unowned && ownCount(g) > 0) return false;
      if (d.multi && !g.coop && !g.pvp) return false;
      if (d.cheap && !cheap(g)) return false;
      return true;
    }).sort((a, b) => d.src === 'sale' ? b.sale - a.sale : a[d.src] - b[d.src]).slice(0, 20);
    const fl = [['unowned', 'Nobody owns it yet'], ['multi', 'Multiplayer only'], ['cheap', `Under ${SYM[state.cur]}20`]];
    $('#view').innerHTML = `
      <div class="section-head" style="margin-top:0"><h2>Discovery</h2><p>What's trending on Steam that the crew hasn't got yet.</p></div>
      <div class="disc-bar">
        <div class="seg" style="min-width:330px">${srcs.map(([k, l]) => `<button class="${d.src === k ? 'on' : ''}" data-dsrc="${k}">${l}</button>`).join('')}</div>
        <div class="filters">${fl.map(([k, l]) => `<button class="toggle ${d[k] ? 'on' : ''}" data-dtf="${k}">${l}</button>`).join('')}</div>
      </div>
      ${list.length ? `<div class="grid" style="margin-top:20px">${list.map(discCard).join('')}</div>` : `<div class="empty" style="margin-top:20px">Nothing matches. Try turning a filter off.</div>`}
      <p class="hint" style="margin-top:20px">Prototype uses made-up charts. The live version pulls Steam's own Most Played, Top Sellers and Specials charts. Keyshop prices come from <a href="https://gg.deals" target="_blank" rel="noopener">GG.deals</a>.</p>`;
  }
  function discCard(g) {
    const d = state.disc, n = ownCount(g);
    const badge = d.src === 'sale' ? `-${g.sale}%` : `#${g[d.src]}`;
    return `<article class="gcard"><div style="position:relative">${art(g)}<span class="rank">${badge}</span></div>
      <div class="body"><h4>${esc(g.name)}</h4>${tags(g)}
        <div class="meta"><span>${playersTxt(g)}</span><span>${n ? n + ' of the crew own it' : 'Nobody owns it'}</span></div>
        ${priceBlock(g)}
      </div>
      <div class="actions"><button class="btn sm ghost" data-pitch="${g.id}">Pitch it</button><a href="${storeUrl(g)}" target="_blank" rel="noopener">Steam ↗</a></div>
    </article>`;
  }

  /* ---------- pitches ---------- */
  function renderPitches() {
    const sorted = [...state.pitches].sort((a, b) => b.votes.length - a.votes.length || b.at - a.at);
    $('#view').innerHTML = `<div class="pitch-layout"><div>
        <div class="section-head" style="margin-top:0"><h2>Search Steam</h2></div>
        <div class="search"><input id="q" placeholder="Search for a game…" value="${esc(state.query)}" autocomplete="off"></div>
        <p class="hint">The prototype only searches a small fake list. The live version will search the whole Steam store.</p>
        <div class="results" id="results">${resultsHtml()}</div>
      </div><div>
        <div class="section-head" style="margin-top:0"><h2>Shortlist</h2><span class="count">${sorted.length}</span><p>Vote for what you'd play.</p></div>
        <div class="shortlist">${sorted.map(pitchHtml).join('')}</div>
      </div></div>`;
  }
  function resultsHtml() {
    const q = state.query.trim().toLowerCase();
    if (!q) return `<div class="empty">Try “lethal”, “deep rock” or “golf”.</div>`;
    const res = GAMES.filter(g => g.name.toLowerCase().includes(q)).slice(0, 8);
    if (!res.length) return `<div class="empty">No matches for “${esc(state.query)}”.</div>`;
    return res.map(g => `<div class="result">${art(g)}<div><b>${esc(g.name)}</b><small>${ownCount(g)} of the crew own it</small>${priceBlock(g)}</div><button class="btn sm" data-pitch="${g.id}">Pitch it</button></div>`).join('');
  }
  function pitchHtml(p) {
    const g = gameById[p.game], mine = p.votes.includes(ME);
    const to = p.to.length ? p.to.map(t => '@' + esc(crewById[t].name)).join(' ') : 'everyone';
    return `<div class="pitch">
      <button class="vote ${mine ? 'on' : ''}" data-vote="${p.id}" title="${mine ? 'Remove vote' : 'Vote'}"><span>▲</span>${p.votes.length}</button>
      <div><h4>${esc(g.name)}</h4>
        <div class="by">${av(p.by, 'sm')} ${esc(crewById[p.by].name)} → ${to} · ${ago(p.at)}</div>
        ${p.note ? `<div class="note">“${esc(p.note)}”</div>` : ''}
        <div class="foot"><span>${price(g)}</span><span>${ownCount(g)}/${CREW.length} own it</span><span class="stack">${p.votes.map(v => av(v, 'sm')).join('')}</span><a href="${storeUrl(g)}" target="_blank" rel="noopener">Steam ↗</a></div>
      </div></div>`;
  }
  function openPitch(id) { draft = { game: +id, to: [], note: '' }; renderModal(); $('#modal').hidden = false; setTimeout(() => $('#note') && $('#note').focus(), 30); }
  function closeModal() { $('#modal').hidden = true; draft = null; }
  function renderModal() {
    const g = gameById[draft.game];
    $('#modal').innerHTML = `<div class="sheet" role="dialog" aria-label="Pitch a game">${art(g)}<div class="in">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><h3>Pitch ${esc(g.name)}</h3><button class="linkbtn" data-close>Close ✕</button></div>
      <div><div class="label" style="margin-bottom:8px">Who's it for?</div><div class="crew">
        <button class="chip ${!draft.to.length ? 'on' : ''}" data-to="">Everyone</button>
        ${CREW.filter(c => c.id !== ME).map(c => `<button class="chip ${draft.to.includes(c.id) ? 'on' : ''}" data-to="${c.id}">${av(c.id, 'sm')}${esc(c.name)}</button>`).join('')}
      </div></div>
      <div><div class="label" style="margin-bottom:8px">Note</div><textarea id="note" rows="2" placeholder="Hey look at this game…">${esc(draft.note)}</textarea></div>
      <div><div class="label" style="margin-bottom:8px">Discord preview · #game-pitches</div><div id="dpreview">${discordPreview()}</div></div>
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

  /* ---------- leaderboard ---------- */
  function renderLb() {
    const pub = CREW.filter(c => !c.private), mode = state.lb;
    const rows = pub.map(c => {
      const lib = LIB[c.id] || {}, ids = Object.keys(lib);
      let top = null, topV = 0;
      ids.forEach(id => { const v = mode === 'recent' ? lib[id].h2w : lib[id].h; if (v > topV) { topV = v; top = +id; } });
      const val = mode === 'recent' ? ids.reduce((a, id) => a + lib[id].h2w, 0)
        : mode === 'all' ? ids.reduce((a, id) => a + lib[id].h, 0) : ids.length;
      return { c, val: Math.round(val * 10) / 10, top, topV };
    }).sort((a, b) => b.val - a.val);
    const max = rows[0] ? rows[0].val || 1 : 1;
    const unit = { recent: 'hrs · 2 weeks', all: 'hrs · all time', owned: 'games' }[mode];
    const together = GAMES.map(g => {
      const pl = pub.filter(c => owns(c.id, g.id));
      return { g, n: pl.length, h: pl.reduce((a, c) => a + LIB[c.id][g.id].h, 0) };
    }).filter(x => x.n >= 2).sort((a, b) => b.h - a.h).slice(0, 6);
    const medal = i => ['🥇', '🥈', '🥉'][i] || i + 1;
    const modes = [['recent', 'Last 2 weeks'], ['all', 'All time'], ['owned', 'Games owned']];
    const priv = CREW.filter(c => c.private).map(c => c.name).join(', ');

    $('#view').innerHTML = `<div class="lb-layout"><div>
        <div class="section-head" style="margin-top:0"><h2>Leaderboard</h2></div>
        <div class="filters" style="margin-bottom:16px">${modes.map(([k, l]) => `<button class="toggle ${mode === k ? 'on' : ''}" data-lb="${k}">${l}</button>`).join('')}</div>
        ${rows.map((r, i) => `<div class="lbrow ${i === 0 ? 'gold' : ''}"><div class="rank">${medal(i)}</div>${av(r.c.id, 'lg')}
          <div><b>${esc(r.c.name)}</b>${mode !== 'owned' && r.top ? `<div class="fav">Mostly ${esc(gameById[r.top].name)} · ${Math.round(r.topV)}h</div>` : ''}
          <div class="bar"><i style="width:${(r.val / max) * 100}%"></i></div></div>
          <div class="val">${r.val}<small>${unit}</small></div></div>`).join('')}
        <p class="hint">${priv ? esc(priv) + ' not shown (private Steam profile). ' : ''}The live version will save a snapshot every night, so you can have weekly and monthly boards too.</p>
      </div>
      <div class="panel"><h3>Most played together</h3><ul class="together">
        ${together.map(t => `<li><span>${esc(t.g.name)}</span><span>${t.h}h · ${t.n} players</span></li>`).join('')}
      </ul></div></div>`;
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
  document.addEventListener('click', e => {
    const t = e.target.closest('button,[data-close]');
    if (e.target.id === 'modal') return closeModal();
    if (!t) return;
    const d = t.dataset;

    if (d.id && t.classList.contains('chip') && t.closest('#crew')) {
      state.on.has(d.id) ? state.on.delete(d.id) : state.on.add(d.id);
      store.set('on', [...state.on]); renderCrew(); render(); return;
    }
    if (d.crew) {
      state.on = new Set(d.crew === 'all' ? CREW.map(c => c.id) : d.crew === 'core' ? CORE : []);
      store.set('on', [...state.on]); renderCrew(); render(); return;
    }
    if (d.tf) { state.tf[d.tf] = !state.tf[d.tf]; render(); return; }
    if (d.pool) { state.sh.pool = d.pool; store.set('shuffle', state.sh); render(); return; }
    if (d.sh) { state.sh[d.sh] = !state.sh[d.sh]; store.set('shuffle', state.sh); render(); return; }
    if (t.id === 'rollBtn') { roll(); return; }
    if (d.act === 'yes' && state.current) {
      if (state.history[0]) state.history[0].verdict = '👍 playing';
      toast(`Posted to <b>#game-pitches</b>: the group rolled <b>${esc(gameById[state.current].name)}</b> 🎲 (mock)`);
      render(); return;
    }
    if (d.act === 'nah' && state.current) {
      state.hidden.add(state.current);
      if (state.history[0]) state.history[0].verdict = '👎 nah';
      roll(); return;
    }
    if (d.act === 'unhide') { state.hidden.clear(); render(); return; }
    if (d.pitch) { openPitch(d.pitch); return; }
    if (d.vote) {
      const p = state.pitches.find(x => x.id === d.vote);
      if (p) { p.votes = p.votes.includes(ME) ? p.votes.filter(v => v !== ME) : [...p.votes, ME]; store.set('pitches', state.pitches); render(); }
      return;
    }
    if (d.lb) { state.lb = d.lb; render(); return; }
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
      state.pitches.unshift({ id: 'p' + Date.now(), game: draft.game, by: ME, to: draft.to, note: draft.note.trim(), votes: [ME], at: Date.now() });
      store.set('pitches', state.pitches);
      closeModal();
      toast(`Pitched <b>${esc(g.name)}</b> to <b>#game-pitches</b> (mock)`);
      if (state.view === 'pitches') render();
    }
  });

  document.addEventListener('input', e => {
    if (e.target.id === 'q') { state.query = e.target.value; $('#results').innerHTML = resultsHtml(); }
    if (e.target.id === 'note' && draft) { draft.note = e.target.value; $('#dpreview').innerHTML = discordPreview(); }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#modal').hidden) { closeModal(); return; }
    const typing = /INPUT|TEXTAREA/.test(document.activeElement.tagName);
    if (e.code === 'Space' && state.view === 'shuffle' && !typing && $('#modal').hidden) { e.preventDefault(); roll(); }
  });

  window.addEventListener('hashchange', route);

  /* ---------- init ---------- */
  $('#burrito').innerHTML = burritoSVG();
  $('#me').innerHTML = `${av(ME)}<div>${esc(crewById[ME].name)}<small>Discord login (mock)</small></div>`;
  renderCrew();
  route();
})();
