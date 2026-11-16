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
  // Fake Steam profile numbers for the leaderboards (live mode gets these from Steam daily)
  const PX = (level, year, badges, friends, ach, perfect, cs2) => ({ level, created: Date.UTC(year, 4, 1), badges, friends, ach_pct: ach, perfect, cs2 });
  const XS = {
    james: PX(38, 2012, 41, 87, 34.2, 3, { kd: 1.12, hs: 47.3, win: 51.8, acc: 18.4, mvps: 1240, matches: 1610, kills: 19885 }),
    bradley: PX(21, 2015, 18, 54, 41.7, 5, { kd: 0.94, hs: 39.1, win: 48.2, acc: 16.9, mvps: 610, matches: 880, kills: 11203 }),
    conor: PX(12, 2019, 9, 33, 22.5, 0, null),
    aoife: PX(55, 2010, 77, 140, 63.9, 14, { kd: 1.31, hs: 52.6, win: 55.0, acc: 21.2, mvps: 2010, matches: 2400, kills: 30551 }),
    dee: PX(17, 2017, 12, 41, 28.0, 1, null),
    niamh: PX(9, 2021, 5, 22, 51.3, 2, null),
    sam: PX(30, 2013, 26, 61, 19.8, 0, { kd: 0.81, hs: 35.5, win: 46.0, acc: 15.1, mvps: 300, matches: 520, kills: 5400 }),
  };
  CREW.forEach(c => { if (XS[c.id]) c.x = XS[c.id]; });

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

  // Fake review scores, moddability and a couple of single-player games for fake-data mode
  GAMES.push(
    G(367520, 'Hollow Knight', 14.79, { tags: ['Metroidvania', 'Singleplayer'], pop: .55 }),
    G(1145360, 'Hades', 24.50, { tags: ['Roguelike', 'Singleplayer'], pop: .5 }),
  );
  const MOD = [4000, 271590, 892970, 108600, 413150, 550, 602960, 252490, 632360, 105600, 227300, 526870, 251570, 322330, 1623730, 1086940, 367520];
  const WORKSHOP = [4000, 550, 602960, 108600, 413150, 227300, 251570, 322330, 105600];
  const SCORES = [9, 9, 8, 8, 8, 7, 6, 9, 5, 8, 4, 9, 8];
  GAMES.forEach((g, i) => {
    g.modded = MOD.includes(g.id); g.workshop = WORKSHOP.includes(g.id);
    const score = g.id === 2246340 ? 6 : g.id === 2507950 ? 3 : SCORES[i % SCORES.length];
    g.review = { score, pct: { 9: 96, 8: 88, 7: 82, 6: 74, 5: 55, 4: 33, 3: 24 }[score], count: 2000 + ((g.id * 37) % 900000) };
  });

  // Short descriptions (fake mode only; live mode pulls Steam's description + trailer).
  const DESC = {
    1966720: 'Co-op scavenging on abandoned moons for a company that sees you as expendable. Hit the quota or else.',
    548430: 'Space dwarves mining deep inside a hostile alien planet. Dig, shoot bugs, and get everyone back to the drop pod.',
    553850: 'Squad shooter spreading managed democracy across the galaxy, usually by accidentally blowing up your teammates.',
    730: 'The classic 5v5 tactical shooter. Plant or defuse, manage the economy, argue about the economy.',
    1172470: 'Hero-based battle royale in squads of three, with fast movement and character abilities.',
    945360: 'Crewmates do tasks while impostors sabotage and kill, then everyone argues in the emergency meeting.',
    739630: 'Ghost-hunting co-op horror. Gather evidence with your kit, identify the ghost, try not to die.',
    431240: 'Chaotic mini-golf for up to 12 players across silly themed courses.',
    892970: 'Viking survival and base building in a procedurally generated purgatory. Best with a crew.',
    271590: 'Open-world crime sandbox: GTA Online, heists, and the base game you need for FiveM.',
    252490: 'Harsh multiplayer survival where other players are the biggest threat. Build, raid, repeat.',
    1172620: 'Pirate crew adventure. Sail together, hunt treasure and fight other ships on a shared sea.',
    2881650: 'Film spooky footage with friends, go viral, and try to make it home with the camera.',
    3241660: 'Physics co-op horror: haul valuables out of creepy places without breaking them, or yourselves.',
    381210: 'Asymmetric horror. Four survivors try to escape while one player hunts them as the killer.',
    1260320: 'Physics brawler with floppy, adorable animals throwing each other out of arenas.',
    285900: 'Wobbly physics fighting between gelatinous people in hazardous levels.',
    550: 'Four-player co-op zombie shooter through campaigns, plus Versus with special infected.',
    4000: 'Physics sandbox with endless community modes like Prop Hunt, TTT and Murder.',
    291550: 'Free platform fighter with loads of legends. Up to 8 in a match.',
    2073850: 'Free team shooter on fully destructible arenas, framed as a TV game show.',
    648800: 'Survive on a raft in the open ocean, pulling in debris to build it into a floating base.',
    108600: 'Hardcore isometric zombie survival. Not about if you die, but how.',
    880940: 'Party board game with brutal minigames that ruin friendships.',
    632360: 'Third-person roguelike shooter. Stack items, survive escalating difficulty, loop.',
    602960: '2D co-op submarine sim on an alien ocean. Everything breaks, someone is a traitor, nothing is fine.',
    728880: 'Chaotic co-op cooking against the clock in increasingly ridiculous kitchens.',
    413150: 'Relaxing farming and life sim with up to 8 players sharing a farm.',
    1211630: 'Party games played with your phone as the controller. Great for big groups.',
    3527290: 'Co-op climbing game: get the whole group to the top of a mysterious island.',
    570: 'Free 5v5 MOBA with a huge hero pool and a famously steep learning curve.',
    578080: 'The original battle royale. Free to play, squads of up to four.',
    2767030: 'Free 6v6 hero shooter with destructible maps and team-up abilities.',
    2694490: 'Dark action RPG with deep build crafting and online co-op for up to six.',
    236390: 'Free vehicle combat with tanks, planes, helicopters and ships across many eras.',
    3164500: 'Co-op crime-empire sim: start small, scale up production, stay ahead of the cops.',
    2507950: 'Free tactical shooter with large-scale warfare and extraction modes.',
    1623730: 'Catch creatures, build a base and survive together, up to 32 on a server.',
    2622380: 'Three-player co-op roguelike set in the Elden Ring universe, built around short expeditions.',
    2246340: 'Hunt huge monsters with up to four players, craft gear from them, hunt bigger ones.',
    230410: 'Free co-op space-ninja action with an endless gear grind.',
    251570: 'Open-world zombie survival with crafting and base building. Hold out on horde night.',
    1086940: 'Party-based RPG built on D&D rules, with a full four-player co-op campaign.',
    227300: 'Drive trucks across Europe and run convoys with friends.',
    105600: '2D sandbox of digging, building and boss fights, with up to 8 players.',
    1326470: 'Survival horror on a cannibal-infested island, co-op for up to 8.',
    526870: 'First-person factory building on an alien planet. Dangerously good in co-op.',
    322330: 'Co-op wilderness survival in a strange, dark world. Don’t starve, obviously.',
    2001120: 'Two-player co-op adventure hopping between sci-fi and fantasy worlds. Needs exactly two.',
    962130: 'Shrunk to the size of an ant, survive a back garden with up to four players.',
    1621690: 'Underground mining sandbox adventure for up to 8 players.',
    367520: 'Hand-drawn metroidvania through a ruined bug kingdom. Solo only.',
    1145360: 'Fast roguelike dungeon crawler: fight your way out of the Underworld. Solo only.',
    2567870: 'Co-op climbing while chained to your mates. Communication is everything.',
  };
  GAMES.forEach(g => { g.desc = DESC[g.id] || ''; });

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

  // Fake install sizes, last-updated dates and last-played dates for fake-data mode
  const DAY = 864e5;
  GAMES.forEach((g, i) => {
    g.size = [4096, 85 * 1024, 12 * 1024, 3 * 1024, 65 * 1024, 1536, 30 * 1024, 7 * 1024, 110 * 1024, 2048, 20 * 1024, 45 * 1024][i % 12];
    g.lastUpdate = Date.now() - (g.id === 431240 ? 620 : g.id === 285900 ? 410 : [2, 9, 21, 40, 75, 130, 5, 14][i % 8]) * DAY;
    g.lastNews = g.lastUpdate + 2 * DAY;
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
        const unplayed = r() < 0.18;
        LIB[c.id][g.id] = {
          h: unplayed ? 0 : Math.round(Math.pow(r(), 2.2) * 600 + 1),
          h2w: r() < 0.3 ? Math.round(r() * 250) / 10 : 0,
          lp: unplayed ? null : Date.now() - Math.round(Math.pow(r(), 2) * 400) * 864e5,
        };
      }
    });
  });
  // Make sure the core crew share a few staples
  [1966720, 271590, 4000, 550].forEach(id => ['james', 'bradley'].forEach(p => {
    LIB[p][id] = LIB[p][id] || { h: Math.round(r() * 300 + 20), h2w: Math.round(r() * 80) / 10 };
  }));

  [367520, 1145360].forEach(id => { LIB.james[id] = LIB.james[id] || { h: Math.round(r() * 80 + 15), h2w: 0 }; });
  const now = Date.now(), H = 3600e3;
  const PITCHES = [
    { id: 'p1', game: 3241660, by: 'bradley', to: [], note: 'Looks class for 6 of us, cheap too', votes: ['bradley', 'conor', 'aoife'], at: now - 5 * H },
    { id: 'p2', game: 3527290, by: 'james', to: [], note: "€8 and it's 4 player co-op", votes: ['james', 'bradley'], at: now - 26 * H },
    { id: 'p3', game: 602960, by: 'conor', to: ['james'], note: "James you'd love this, the sub always ends up exploding", votes: ['conor'], at: now - 50 * H },
  ];

  const NEWS = [
    [1966720, 'Version 80 - The Blooming Update', true, 1, 'New creatures for the forest moons, a utility slot for purchased tools and a few new rooms.'],
    [553850, 'Patch 1.004 is live', true, 2, 'Weapon balance changes, a fix for extraction crashes and a new stratagem.'],
    [4000, 'Summer sale + workshop spotlight', false, 3, 'Our favourite community maps and addons this month.'],
    [548430, 'Season 6 roadmap', false, 5, 'A look at what is coming to Hoxxes next: new biome, new enemies, new rock.'],
    [892970, 'Hotfix 0.219.16', true, 8, 'Fixed an issue where boats could sink through docks. Again.'],
    [730, 'Counter-Strike 2 update', true, 1, 'Map pool changes, animation fixes and a new case.'],
    [3241660, 'R.E.P.O. update 0.2: new level', true, 12, 'A haunted museum, two new monsters and much louder screaming.'],
  ].map(([appid, title, patch, daysAgo, snippet], i) => ({ gid: 'n' + i, appid, title, patch, snippet, date: Date.now() - daysAgo * 864e5 - i * 3600e3, url: `https://store.steampowered.com/news/app/${appid}` }));

  // FiveM: Steam logs it as Source SDK Base 2007 (app 218)
  GAMES.push(G(218, 'FiveM (Source SDK Base 2007)', 0, { coop: true, pvp: true, modded: true, tags: ['Roleplay', 'GTA V', 'Multiplayer', 'Open World'], size: 3900,
    desc: 'GTA V roleplay and custom servers. Steam counts FiveM time as Source SDK Base 2007.' }));
  [['james', 2751, 22], ['bradley', 1840, 9], ['conor', 960, 0], ['dee', 310, 4], ['sam', 75, 0]].forEach(([id, h, h2w]) => {
    if (LIB[id]) LIB[id][218] = { h, h2w, lp: Date.now() - (h2w ? 2 : 40) * 864e5 };
  });
  // "Is it ported?" sample feed (live mode reads Quiver Launcher + r/decomps + r/recomps)
  const hr = 3600e3;
  const PORTS = [
    { key: 'quiver:skate-3-recomp', source: 'quiver', kind: 'update', title: 'Skate 3 Recomp', url: 'https://quiverlauncher.com', game: 'Skate 3', version: 'v0.9.2', date: Date.now() - 3 * hr,
      summary: 'Native PC recompilation of Skate 3 with online multiplayer through a community server, 4K and unlocked framerate.', tags: ['X360', 'port', 'recomp', 'online multiplayer', 'widescreen'], multi: true, img: null },
    { key: 'reddit:t3_a1', source: 'reddit', kind: 'post', title: 'GTA IV decomp: 4-player co-op mod is working in story missions', url: 'https://www.reddit.com/r/decomps/', game: null, date: Date.now() - 8 * hr,
      summary: 'Got the first co-op build running. Missions sync, but cutscenes still desync for the passenger. Looking for testers.', tags: ['r/decomps'], multi: true, img: null },
    { key: 'quiver:zelda64-recomp', source: 'quiver', kind: 'new', title: 'Zelda 64: Recompiled', url: 'https://quiverlauncher.com', game: "The Legend of Zelda: Majora's Mask", version: '1.2.0', date: Date.now() - 20 * hr,
      summary: "Majora's Mask running natively on PC with widescreen, mods and gyro aiming.", tags: ['N64', 'port', 'recomp', 'widescreen', 'mods'], multi: false, img: null },
    { key: 'reddit:t3_a2', source: 'reddit', kind: 'post', title: 'Red Dead Redemption PS3 recomp progress: boots to menu', url: 'https://www.reddit.com/r/recomps/', game: null, date: Date.now() - 30 * hr,
      summary: 'Still very early, but the menu and first mission load. Multiplayer is out of scope for now.', tags: ['r/recomps'], multi: true, img: null },
    { key: 'quiver:sonic-unleashed', source: 'quiver', kind: 'update', title: 'Unleashed Recompiled', url: 'https://quiverlauncher.com', game: 'Sonic Unleashed', version: '1.0.3', date: Date.now() - 52 * hr,
      summary: 'The Xbox 360 version of Sonic Unleashed as a native PC game.', tags: ['X360', 'port', 'recomp', 'ultrawide'], multi: false, img: null },
    { key: 'reddit:t3_a3', source: 'reddit', kind: 'post', title: 'Left 4 Dead 2 split-screen restored on PC via a decomp of the console build', url: 'https://www.reddit.com/r/decomps/', game: null, date: Date.now() - 70 * hr,
      summary: 'Split-screen for 2 players works with controllers. Online still goes through Steam.', tags: ['r/decomps'], multi: true, img: null },
  ];
  window.BG_DATA = { CREW, GAMES, LIB, ME: 'james', PITCHES, NEWS, PORTS };
})();
