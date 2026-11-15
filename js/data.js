// FAKE DATA for the prototype.
// In the live version this file is replaced by calls to the backend (Cloudflare Worker),
// which pulls real libraries/playtime from the Steam Web API and members from Discord.
(() => {
  function rng(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const r = rng(42);

  const CREW = [
    { id: 'james',   name: 'James',   color: '#C8321F' },
    { id: 'bradley', name: 'Bradley', color: '#3E6FB0' },
    { id: 'lukas',   name: 'Lukas',   color: '#3E8E5A', private: true },
    { id: 'conor',   name: 'Conor',   color: '#8A4FB5' },
    { id: 'aoife',   name: 'Aoife',   color: '#D9822B' },
    { id: 'dee',     name: 'Dee',     color: '#1D8A99' },
    { id: 'niamh',   name: 'Niamh',   color: '#B5446E' },
    { id: 'sam',     name: 'Sam',     color: '#6B7A2A' },
  ];

  // id = Steam app id (used for header art + store links). Prices are made up.
  // max = group-tagged max players (Steam doesn't publish this).
  const G = (id, name, price, o) => ({ id, name, price, f2p: price === 0, coop: false, pvp: false, max: null, tags: [], pop: 0.5, ...o });
  const GAMES = [
    G(1966720, 'Lethal Company', 9.75, { coop: true, max: 4, tags: ['Co-op', 'Horror'], pop: .8 }),
    G(548430, 'Deep Rock Galactic', 29.99, { coop: true, max: 4, tags: ['Co-op', 'Shooter'], pop: .6 }),
    G(553850, 'HELLDIVERS 2', 39.99, { seller: 8, sale: 30, coop: true, max: 4, tags: ['Co-op', 'Shooter'], pop: .55 }),
    G(730, 'Counter-Strike 2', 0, { played: 1, pvp: true, max: 10, tags: ['PvP', 'Shooter'], pop: .9 }),
    G(1172470, 'Apex Legends', 0, { played: 19, pvp: true, max: 3, tags: ['PvP', 'Battle royale'], pop: .6 }),
    G(945360, 'Among Us', 3.99, { pvp: true, max: 15, tags: ['Party', 'Social deduction'], pop: .7 }),
    G(739630, 'Phasmophobia', 13.99, { coop: true, max: 4, tags: ['Co-op', 'Horror'], pop: .6 }),
    G(431240, 'Golf With Your Friends', 14.99, { pvp: true, max: 12, tags: ['Party', 'Sports'], pop: .5 }),
    G(892970, 'Valheim', 19.99, { sale: 40, coop: true, max: 10, tags: ['Co-op', 'Survival'], pop: .5 }),
    G(271590, 'Grand Theft Auto V', 29.99, { coop: true, pvp: true, max: 30, tags: ['Open world', 'FiveM'], pop: .85 }),
    G(252490, 'Rust', 39.99, { pvp: true, tags: ['PvP', 'Survival'], pop: .4 }),
    G(1172620, 'Sea of Thieves', 39.99, { sale: 50, coop: true, pvp: true, max: 4, tags: ['Co-op', 'Pirates'], pop: .45 }),
    G(2881650, 'Content Warning', 7.99, { coop: true, max: 4, tags: ['Co-op', 'Horror', 'Comedy'], pop: .55 }),
    G(3241660, 'R.E.P.O.', 9.75, { seller: 4, coop: true, max: 6, tags: ['Co-op', 'Horror', 'Comedy'], pop: .5 }),
    G(381210, 'Dead by Daylight', 19.99, { pvp: true, max: 5, tags: ['PvP', 'Horror'], pop: .4 }),
    G(1260320, 'Party Animals', 19.99, { pvp: true, max: 8, tags: ['Party', 'Brawler'], pop: .35 }),
    G(285900, 'Gang Beasts', 19.99, { pvp: true, max: 8, tags: ['Party', 'Brawler'], pop: .45 }),
    G(550, 'Left 4 Dead 2', 9.75, { coop: true, pvp: true, max: 8, tags: ['Co-op', 'Zombies'], pop: .75 }),
    G(4000, "Garry's Mod", 9.75, { coop: true, pvp: true, tags: ['Sandbox', 'Party'], pop: .8 }),
    G(291550, 'Brawlhalla', 0, { pvp: true, max: 8, tags: ['PvP', 'Fighting'], pop: .4 }),
    G(2073850, 'THE FINALS', 0, { pvp: true, max: 3, tags: ['PvP', 'Shooter'], pop: .4 }),
    G(648800, 'Raft', 19.99, { coop: true, max: 8, tags: ['Co-op', 'Survival'], pop: .4 }),
    G(108600, 'Project Zomboid', 19.99, { coop: true, tags: ['Co-op', 'Zombies'], pop: .35 }),
    G(880940, 'Pummel Party', 14.99, { pvp: true, max: 8, tags: ['Party', 'Minigames'], pop: .35 }),
    G(632360, 'Risk of Rain 2', 24.99, { coop: true, max: 4, tags: ['Co-op', 'Roguelike'], pop: .4 }),
    G(602960, 'Barotrauma', 33.99, { coop: true, max: 16, tags: ['Co-op', 'Sub sim'], pop: .12 }),
    G(728880, 'Overcooked! 2', 24.99, { coop: true, max: 4, tags: ['Co-op', 'Party'], pop: .3 }),
    G(413150, 'Stardew Valley', 13.99, { sale: 30, coop: true, max: 8, tags: ['Co-op', 'Farming'], pop: .5 }),
    G(1211630, 'The Jackbox Party Pack 7', 24.99, { pvp: true, max: 8, tags: ['Party', 'Trivia'], pop: .25 }),
    G(3527290, 'PEAK', 7.99, { seller: 1, coop: true, max: 4, tags: ['Co-op', 'Climbing'], pop: .3 }),
  ];

  // DISCOVERY: trending games nobody in the crew owns (fake ranks).
  // played = Steam weekly most-played rank, seller = top-seller rank, sale = % off.
  // Live version: ISteamChartsService/GetMostPlayedGames + store featuredcategories.
  const X = (id, name, price, o) => G(id, name, price, { disc: true, ...o });
  GAMES.push(
    X(570, 'Dota 2', 0, { played: 2, pvp: true, max: 5, tags: ['PvP', 'MOBA'] }),
    X(578080, 'PUBG: BATTLEGROUNDS', 0, { played: 3, pvp: true, max: 4, tags: ['PvP', 'Battle royale'] }),
    X(2767030, 'Marvel Rivals', 0, { played: 4, pvp: true, max: 6, tags: ['PvP', 'Hero shooter'] }),
    X(2694490, 'Path of Exile 2', 29.99, { played: 5, seller: 3, coop: true, max: 6, tags: ['Co-op', 'ARPG'] }),
    X(236390, 'War Thunder', 0, { played: 6, pvp: true, tags: ['PvP', 'Vehicles'] }),
    X(3164500, 'Schedule I', 19.50, { played: 7, seller: 2, coop: true, max: 4, tags: ['Co-op', 'Sim'] }),
    X(2507950, 'Delta Force', 0, { played: 8, pvp: true, max: 4, tags: ['PvP', 'Shooter'] }),
    X(1623730, 'Palworld', 28.99, { played: 9, seller: 11, coop: true, max: 32, tags: ['Co-op', 'Survival'] }),
    X(2622380, 'ELDEN RING NIGHTREIGN', 39.99, { played: 10, seller: 5, coop: true, max: 3, tags: ['Co-op', 'Soulslike'] }),
    X(2246340, 'Monster Hunter Wilds', 69.99, { played: 11, seller: 6, sale: 40, coop: true, max: 4, tags: ['Co-op', 'Action'] }),
    X(230410, 'Warframe', 0, { played: 12, coop: true, max: 4, tags: ['Co-op', 'Looter'] }),
    X(251570, '7 Days to Die', 44.99, { played: 13, seller: 10, coop: true, max: 8, tags: ['Co-op', 'Zombies'] }),
    X(1086940, "Baldur's Gate 3", 59.99, { played: 14, seller: 9, sale: 20, coop: true, max: 4, tags: ['Co-op', 'RPG'] }),
    X(227300, 'Euro Truck Simulator 2', 19.99, { played: 15, seller: 16, sale: 75, coop: true, max: 8, tags: ['Convoy', 'Sim'] }),
    X(105600, 'Terraria', 9.99, { played: 16, seller: 18, sale: 50, coop: true, max: 8, tags: ['Co-op', 'Sandbox'] }),
    X(1326470, 'Sons Of The Forest', 28.99, { played: 17, seller: 12, sale: 50, coop: true, max: 8, tags: ['Co-op', 'Horror'] }),
    X(526870, 'Satisfactory', 38.99, { played: 18, seller: 14, sale: 30, coop: true, max: 4, tags: ['Co-op', 'Factory'] }),
    X(322330, "Don't Starve Together", 14.99, { played: 20, sale: 66, coop: true, max: 6, tags: ['Co-op', 'Survival'] }),
    X(2001120, 'Split Fiction', 49.99, { seller: 7, sale: 25, coop: true, max: 2, tags: ['Co-op', 'Adventure'] }),
    X(962130, 'Grounded', 39.99, { seller: 13, sale: 50, coop: true, max: 4, tags: ['Co-op', 'Survival'] }),
    X(1621690, 'Core Keeper', 18.50, { seller: 15, sale: 35, coop: true, max: 8, tags: ['Co-op', 'Sandbox'] }),
    X(2567870, 'Chained Together', 4.99, { seller: 17, sale: 20, coop: true, max: 4, tags: ['Co-op', 'Climbing'] }),
  );

  // Regional prices (made up). Live: Steam appdetails with cc=ie / gb / us,
  // keyshop low from the GG.deals API (region param).
  const nice = v => Math.max(0.99, Math.ceil(v) - 0.01);
  GAMES.forEach(g => {
    const keyRatio = 0.45 + r() * 0.35;
    const bases = { EUR: g.price, GBP: g.f2p ? 0 : nice(g.price * 0.86), USD: g.f2p ? 0 : nice(g.price * 1.0) };
    if (g.price === 9.75) bases.USD = 9.99;
    g.prices = {};
    Object.entries(bases).forEach(([cur, base]) => {
      const steam = g.sale ? Math.round(base * (100 - g.sale)) / 100 : base;
      g.prices[cur] = { base, steam, key: g.f2p ? null : Math.round(base * keyRatio * 100) / 100 };
    });
  });

  // LIB[person][appid] = { h: lifetime hours, h2w: hours in last 2 weeks }
  const LIB = {};
  const bias = { james: 1.2, bradley: 1.1 };
  CREW.forEach(c => {
    if (c.private) return;
    LIB[c.id] = {};
    GAMES.forEach(g => {
      if (g.disc) return;
      const p = Math.min(0.95, (g.f2p ? g.pop + 0.1 : g.pop) * (bias[c.id] || 0.8));
      if (r() < p) {
        LIB[c.id][g.id] = {
          h: Math.round(Math.pow(r(), 2.2) * 600 + 1),
          h2w: r() < 0.3 ? Math.round(r() * 250) / 10 : 0,
        };
      }
    });
  });
  // Make sure the core crew share a few staples
  [1966720, 271590, 4000, 550].forEach(id => ['james', 'bradley'].forEach(p => {
    LIB[p][id] = LIB[p][id] || { h: Math.round(r() * 300 + 20), h2w: Math.round(r() * 80) / 10 };
  }));

  const now = Date.now(), H = 3600e3;
  const PITCHES = [
    { id: 'p1', game: 3241660, by: 'bradley', to: [], note: 'Looks class for 6 of us, cheap too', votes: ['bradley', 'conor', 'aoife'], at: now - 5 * H },
    { id: 'p2', game: 3527290, by: 'james', to: [], note: "€8 and it's 4 player co-op", votes: ['james', 'bradley'], at: now - 26 * H },
    { id: 'p3', game: 602960, by: 'conor', to: ['james'], note: "James you'd love this, the sub always ends up exploding", votes: ['conor'], at: now - 50 * H },
  ];

  window.BG_DATA = { CREW, GAMES, LIB, ME: 'james', PITCHES };
})();
