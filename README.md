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
og.png              link-preview image (Discord/WhatsApp embeds)
favicon.svg/.png    browser tab icon
css/style.css       styling (matches the burritogang.com look)
js/config.js        ← the only file you edit: Worker URL + Discord invite
js/data.js          fake sample data (also supplies the Discovery charts for now)
js/api.js           login + loads real data from the Worker
js/app.js           all the UI
js/cats.js          the cat cameos
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
- [x] Co-op / PvP / multiplayer flags, Steam tags, descriptions and IE / UK / US prices for whole libraries in one go (Steam's bulk store lookup)
- [x] Discovery: Steam's top 100 Most Played, Top Sellers, Popular New Releases and On Sale, refreshed daily
- [x] Dark mode (warm espresso, follows your system setting, toggle in the header), clean URLs (no #tabs)
- [x] Profiles: change/unlink Steam, hide games from the site, stats deep dive (hours, tags, daily history, achievements, in-game stats, library value)
- [x] Steam review smileys (:D :) :| :( >:( ), 🔧 Modded tag (Steam Workshop / Moddable), Single-player only filter, "Pitched ✓" buttons, #1 leaderboard taglines
- [x] Keyshop prices (GG.deals) next to Steam prices; live "who's online / in-game" from Steam; roll from the shortlist; mobile hamburger menu; cat cameos 🐈
- [x] Shared pitches + votes, full Steam store search, posts to #game-night via webhook (pitches @mention the people they're for)

## Next steps

1. **Group-tagged max player counts** (Steam doesn't publish them).
2. **Weekly / monthly leaderboards** from the daily snapshots.
