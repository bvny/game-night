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
    live: !!API, call,
    loginUrl: API + '/auth/login',
    logout() { tok.set(null); location.hash = ''; location.reload(); },
  };

  const PALETTE = ['#C8321F', '#3E6FB0', '#3E8E5A', '#8A4FB5', '#D9822B', '#1D8A99', '#B5446E', '#6B7A2A', '#A0522D', '#2F4858', '#C2185B', '#00796B'];

  function normaliseGame(id, g) {
    const tags = [];
    if (g.coop) tags.push('Co-op');
    if (g.pvp) tags.push('PvP');
    (g.genres || []).slice(0, 2).forEach(t => { if (!tags.includes(t)) tags.push(t); });
    const pr = cc => {
      const p = g.prices && g.prices[cc];
      return p ? { base: p.initial / 100, steam: p.final / 100, key: null } : { base: 0, steam: 0, key: null };
    };
    const ie = g.prices && g.prices.ie;
    return {
      id, name: g.name || `App ${id}`, f2p: !!g.is_free, price: ie ? ie.final / 100 : 0,
      coop: !!g.coop, pvp: !!g.pvp, multi: !!g.multi, max: g.max_players || null, tags,
      sale: ie ? ie.discount || 0 : 0, desc: '',
      prices: { EUR: pr('ie'), GBP: pr('gb'), USD: pr('us') },
    };
  }

  function buildData(me, crew) {
    const mock = window.BG_DATA || { GAMES: [] };
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
    // Discovery charts are still sample data until the next backend step
    mock.GAMES.filter(g => g.disc && !crew.games[g.id]).forEach(g => GAMES.push(g));
    window.BG_DATA = { CREW, GAMES, LIB, ME: me.user.id, PITCHES: [], live: true, me: me.user };
  }

  window.BG_READY = (async () => {
    if (!API) return { mode: 'mock' };
    const h = new URLSearchParams(location.hash.slice(1));
    if (h.get('auth')) { tok.set(h.get('auth')); history.replaceState(null, '', location.pathname + '#tonight'); }
    if (h.get('auth_error')) { history.replaceState(null, '', location.pathname); return { mode: 'gate', reason: h.get('auth_error') }; }
    if (!tok.get()) return { mode: 'gate', reason: 'login' };
    try {
      const [me, crew] = await Promise.all([call('/api/me'), call('/api/crew')]);
      buildData(me, crew);
      return { mode: 'live' };
    } catch (e) {
      if (e.status === 401) { tok.set(null); return { mode: 'gate', reason: 'login' }; }
      return { mode: 'gate', reason: 'error', message: e.message };
    }
  })();
})();
