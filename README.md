# Burrito Gang · Game Night

Group game finder for the Burrito Gang Discord, hosted at **gaymers.burritogang.com**.

> **Two modes.** With `API_BASE` empty in `js/config.js`, the site runs on fake sample data with no login. With `API_BASE` set to your Cloudflare Worker, you get Discord login (Burrito Gang members only), real Steam libraries, trailers and descriptions.
> Backend setup: **[worker/SETUP.md](worker/SETUP.md)**.

## What's in it

| Page | What it does |
|---|---|
| **Tonight** | Tick who's on. Shows games *everyone owns*, games only 1–2 people are *missing* (with price), and *free-to-play* picks. Filters: co-op, PvP, fits group size, under €20. |
| **Shuffle** | Coolors-style: press **Space** to roll a random game from the pool. Each roll shows the Steam trailer, description and tags. Choose the pool (everyone owns / missing ≤1 / anything), lock filters, 👎 to hide a game for the session, 👍 to post the pick to Discord. |
| **Discovery** | Steam's Most Played / Top Sellers / On Sale charts, filtered to games nobody in the crew owns. Multiplayer-only and under-20 filters. |
| **Pitches** | Search for a game and "Pitch it" to everyone or specific people with a note (shows a Discord preview). Pitches go on a shortlist the group votes on. |
| **Leaderboard** | Rankings (2 weeks / all time / games owned, most played together) and **Compare**: you vs anyone. Shows head-to-head stats, the games you both own, and what each of you has that the other doesn't. |

Prices show in **€, £ or $** (picker in the header, remembered per browser). Every price shows the Steam price and the cheapest keyshop price, with the cheaper one highlighted.

Private Steam profiles (e.g. Lukas) show as *unknown*, so they never block a game from showing up.

## Files

```
index.html          page shell
CNAME               tells GitHub Pages to serve on gaymers.burritogang.com
css/style.css       styling (matches the burritogang.com look)
js/config.js        ← the only file you edit: Worker URL + Discord invite
js/data.js          fake sample data (also supplies the Discovery charts for now)
js/api.js           login + loads real data from the Worker
js/app.js           all the UI
worker/src/index.js the backend (Cloudflare Worker)
worker/schema.sql   database tables (paste into the D1 console once)
worker/SETUP.md     step-by-step backend setup
```

## Deploying (GitHub Pages)

1. Push these files to the root of a repo on the `bvny` account.
2. Repo → **Settings → Pages** → Source: *Deploy from a branch* → `main` / `(root)`.
3. Custom domain: `gaymers.burritogang.com` (the `CNAME` file fills this in), then tick **Enforce HTTPS** once it appears.
4. DNS (Bradley): `CNAME  gaymers → bvny.github.io`, plus the `_github-pages-challenge-bvny.gaymers` TXT record for verification.

## Built so far

- [x] Discord login, checking the person is in the Burrito Gang server (optional role lock)
- [x] Steam auto-link from Discord connections, or manual link by profile URL / custom URL / SteamID64
- [x] Library + playtime sync, private-profile detection, hourly refresh, daily playtime snapshots
- [x] Game details: Steam trailer (mp4 or HLS), description, genres and multiplayer categories
- [x] Co-op / PvP / multiplayer flags and IE / UK / US Steam prices filled in by the hourly job

## Next steps

1. **Pitches + votes saved in the database**, plus a **Discord webhook** posting to `#game-pitches`.
2. **Real Discovery charts**: `ISteamChartsService/GetMostPlayedGames` plus `store.steampowered.com/api/featuredcategories` (top sellers, specials), cached daily.
3. **Full Steam store search** in Pitches.
4. **Keyshop prices**: cheapest keyshop (Loaded, G2A, etc.) from the free GG.deals API by Steam app ID + region. GG.deals' terms require crediting them and keeping their referral links.
5. **Group-tagged max player counts** (Steam doesn't publish them).
6. **Weekly / monthly leaderboards** from the daily snapshots.
