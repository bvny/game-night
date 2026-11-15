// Talks to the Cloudflare Worker. In fake-data mode (no API_BASE) it does nothing.
(() => {
  const cfg = window.BG_CONFIG || {};
  const API = (cfg.API_BASE || '').replace(/\/$/, '');
  const KEY = 'bg:token';
  const tok = {
    get() { try { return localStorage.getItem(KEY); } catch { return null; } },
    set(v) { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch {} },
  };

  async function call(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    const t = tok.get(); if (t) headers.Authorization = 'Bearer ' + t;
    const r = await fetch(API + path, { ...opts, headers });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(body.error || 'HTTP ' + r.status); e.status = r.status; e.body = body; throw e; }
    return body;
  }

  window.BG_API = {
    live: !!API, call, normaliseGame: (id, g) => normaliseGame(id, g),
    loginUrl: API + '/auth/login',
    logout() { tok.set(null); location.hash = ''; location.reload(); },
  };

  const PALETTE = ['#C8321F', '#3E6FB0', '#3E8E5A', '#8A4FB5', '#D9822B', '#1D8A99', '#B5446E', '#6B7A2A', '#A0522D', '#2F4858', '#C2185B', '#00796B'];

  function normaliseGame(id, g) {
    const tags = [];
    if (g.coop) tags.push('Co-op');
    if (g.pvp) tags.push('PvP');
    (g.tags || []).forEach(t => { if (tags.length < 4 && !tags.includes(t) && !/^(Co-op|Online Co-Op|PvP|Multiplayer)$/i.test(t)) tags.push(t); });
    const pr = cc => {
      const p = g.prices && g.prices[cc];
      return p ? { base: p.initial / 100, steam: p.final / 100, key: null } : { base: 0, steam: 0, key: null };
    };
    const ie = g.prices && g.prices.ie;
    return {
      id, name: g.name || `App ${id}`, f2p: !!g.is_free, price: ie ? ie.final / 100 : 0,
      coop: !!g.coop, pvp: !!g.pvp, multi: !!g.multi, known: !!g.meta_at, max: g.max_players || null, tags,
      sale: ie ? ie.discount || 0 : 0, desc: g.description || '',
      img: g.img || null, review: g.review || null, modded: !!g.modded, workshop: !!g.workshop,
      prices: { EUR: pr('ie'), GBP: pr('gb'), USD: pr('us') },
    };
  }

  function buildData(me, crew) {
    const CREW = crew.users.map((u, i) => ({
      id: u.id, name: u.name, avatar: u.avatar, color: PALETTE[i % PALETTE.length],
      private: !u.steam_id || u.steam_private, unlinked: !u.steam_id,
    }));
    const LIB = {};
    Object.entries(crew.library).forEach(([uid, games]) => {
      LIB[uid] = {};
      Object.entries(games).forEach(([appid, [m, m2]]) => { LIB[uid][appid] = { h: Math.round(m / 6) / 10, h2w: Math.round(m2 / 6) / 10 }; });
    });
    const GAMES = Object.entries(crew.games).map(([appid, g]) => normaliseGame(+appid, g));
    window.BG_DATA = { CREW, GAMES, LIB, ME: me.user.id, PITCHES: [], live: true, me: me.user, pendingInfo: crew.pending_info || 0 };
  }

  window.BG_READY = (async () => {
    if (!API) return { mode: 'mock' };
    const h = new URLSearchParams(location.hash.slice(1));
    if (h.get('auth')) { tok.set(h.get('auth')); history.replaceState(null, '', location.pathname); }
    if (h.get('auth_error')) { history.replaceState(null, '', location.pathname); return { mode: 'gate', reason: h.get('auth_error') }; }
    if (!tok.get()) return { mode: 'gate', reason: 'login' };
    try {
      const [me, crew, pitches] = await Promise.all([call('/api/me'), call('/api/crew'), call('/api/pitches').catch(() => null)]);
      buildData(me, crew);
      if (pitches) { window.BG_DATA.PITCHES = pitches.pitches; window.BG_DATA.pitchGames = pitches.games; }
      return { mode: 'live' };
    } catch (e) {
      if (e.status === 401) { tok.set(null); return { mode: 'gate', reason: 'login' }; }
      return { mode: 'gate', reason: 'error', message: e.message };
    }
  })();
})();
