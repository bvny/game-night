# Burrito Gang · Game Night

Group game finder for the Burrito Gang Discord, hosted at **gaymers.burritogang.com**.

> **Status: front-end prototype.** Everything runs on fake data in `js/data.js`.
> Steam and Discord are not connected yet.

## What's in it

| Page | What it does |
|---|---|
| **Tonight** | Tick who's on. Shows games *everyone owns*, games only 1–2 people are *missing* (with price), and *free-to-play* picks. Filters: co-op, PvP, fits group size, under €20. |
| **Shuffle** | Coolors-style: press **Space** to roll a random game from the pool. Choose the pool (everyone owns / missing ≤1 / anything), lock filters, 👎 to hide a game for the session, 👍 to post the pick to Discord. |
| **Discovery** | Steam's Most Played / Top Sellers / On Sale charts, filtered to games nobody in the crew owns. Multiplayer-only and under-20 filters. |
| **Pitches** | Search for a game and "Pitch it" to everyone or specific people with a note (shows a Discord preview). Pitches go on a shortlist the group votes on. |
| **Leaderboard** | Hours in the last 2 weeks, all-time hours, games owned, and "most played together". |

Prices show in **€, £ or $** (picker in the header, remembered per browser). Every price shows the Steam price and the cheapest keyshop price, with the cheaper one highlighted.

Private Steam profiles (e.g. Lukas) show as *unknown*, so they never block a game from showing up.

## Files

```
index.html      page shell
css/style.css   styling (matches the burritogang.com look)
js/data.js      FAKE data, replaced by API calls later
js/app.js       all the UI logic
CNAME           tells GitHub Pages to serve on gaymers.burritogang.com
```

No build step. Open `index.html` in a browser to try it locally.

## Deploying (GitHub Pages)

1. Push these files to the root of a repo on the `bvny` account.
2. Repo → **Settings → Pages** → Source: *Deploy from a branch* → `main` / `(root)`.
3. Custom domain: `gaymers.burritogang.com` (the `CNAME` file fills this in), then tick **Enforce HTTPS** once it appears.
4. DNS (Bradley): `CNAME  gaymers → bvny.github.io`, plus the `_github-pages-challenge-bvny.gaymers` TXT record for verification.

## Next steps

1. **Backend (Cloudflare Worker + D1).** It will handle:
   - Discord OAuth: check that the person is in the Burrito Gang server and read any Steam account linked to their Discord
   - Steam Web API: `GetOwnedGames`, `GetPlayerSummaries` and store details/search
   - Shared pitches and votes
   - A nightly cron job that snapshots playtime
2. **Swap `js/data.js` for `fetch()` calls** to the Worker.
3. **Prices.** Steam prices from the store `appdetails` endpoint with `cc=ie` / `gb` / `us`. Cheapest keyshop price (Loaded, G2A, Eneba, etc.) from the free **GG.deals API** by Steam app ID with a `region` param. GG.deals' terms require crediting them with a link and keeping their referral links. It gives one "cheapest keyshop" figure, not a price per shop; the link goes to the GG.deals page that lists every shop.
4. **Discovery charts.** `ISteamChartsService/GetMostPlayedGames` plus `store.steampowered.com/api/featuredcategories` (top sellers, specials), cached daily.
5. **Discord webhook** for posts to `#game-pitches`.
6. **Group-tagged max player counts** (Steam doesn't publish them).
