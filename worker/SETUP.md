# Backend setup: Discord login + Steam linking

This walkthrough uses websites only, with no command line. It takes about 30–40 minutes the first time.

You'll make three free accounts or keys and then plug them into a Cloudflare Worker (the backend).

Keep a notepad open. You'll collect these values as you go:

| Value | Where it comes from | Secret? |
|---|---|---|
| `DISCORD_CLIENT_ID` | Discord Developer Portal | no |
| `DISCORD_CLIENT_SECRET` | Discord Developer Portal | **yes** |
| `DISCORD_GUILD_ID` | the Burrito Gang server ID | no |
| `STEAM_API_KEY` | Steam | **yes** |
| `SESSION_SECRET` | you make it up (long random text) | **yes** |
| `FRONTEND_URL` | `https://gaymers.burritogang.com` | no |

> Never paste secrets into Discord, GitHub or the website files. They only go into Cloudflare.

---

## Step 1: Create the Worker (so you know its web address)

1. Sign up at **dash.cloudflare.com** (free).
2. Left menu: **Compute (Workers) → Workers & Pages → Create → Create Worker** (pick "Start with Hello World" if asked).
3. Name it `burrito-game-night-api` and click **Deploy**.
4. You'll see its address, something like `https://burrito-game-night-api.YOURNAME.workers.dev`. **Copy it.** This is your *Worker URL*.

## Step 2: Discord application

1. Go to **discord.com/developers/applications → New Application** and name it "Burrito Game Night".
2. Left menu: **OAuth2**.
   - Copy the **Client ID**. That's `DISCORD_CLIENT_ID`.
   - Click **Reset Secret** and copy it. That's `DISCORD_CLIENT_SECRET`. You can only see it once.
   - Under **Redirects** click **Add Redirect** and paste your Worker URL followed by `/auth/callback`, e.g.
     `https://burrito-game-night-api.YOURNAME.workers.dev/auth/callback`
     Then click **Save Changes**.
3. You don't need a bot for this.
4. Server ID: in the Discord app go to **User Settings → Advanced → Developer Mode (on)**. Then right-click the Burrito Gang server icon and choose **Copy Server ID**. That's `DISCORD_GUILD_ID`.
5. *(Optional)* To only let people with a certain role in, right-click the role in **Server Settings → Roles** and choose **Copy Role ID**. That's `DISCORD_REQUIRED_ROLE_ID`.

## Step 3: Steam Web API key

1. Go to **steamcommunity.com/dev/apikey** and log in.
2. Domain: `gaymers.burritogang.com`. Agree and register.
3. Copy the key. That's `STEAM_API_KEY`.
   - Steam only gives keys to accounts that have spent at least $5 on Steam. Use the account of whoever has.

## Step 4: Make a session secret

This signs everyone's logins. Make it 40+ random characters, for example from a password manager's generator. Don't reuse a real password. That's `SESSION_SECRET`.

## Step 5: Create the database

1. Cloudflare left menu: **Storage & Databases → D1 SQL Database → Create**.
2. Name it `burrito-game-night` and click **Create**.
3. Open it, go to the **Console** tab, paste **everything** from `worker/schema.sql`, and click **Execute**. Then type `/tables` and Execute again: you should see `users`, `library`, `games` and `snapshots`. (The menu may call it "D1 SQLite Database". That is the same thing.)

## Step 6: Put the code in the Worker

1. **Workers & Pages → burrito-game-night-api → Edit code**.
2. Delete everything in the editor and paste **all** of `worker/src/index.js`.
3. Click **Deploy**.

## Step 7: Connect everything (Worker → Settings)

**Bindings → Add → D1 database**
- Variable name: `DB` (exactly that)
- Database: `burrito-game-night`
- Click **Deploy**

**Variables and Secrets → Add**. Add each of these. Use type **Text** for the plain ones and **Secret** for the secret ones:

| Name | Type | Value |
|---|---|---|
| `FRONTEND_URL` | Text | `https://gaymers.burritogang.com` |
| `DISCORD_CLIENT_ID` | Text | from step 2 |
| `DISCORD_GUILD_ID` | Text | from step 2 |
| `DISCORD_CLIENT_SECRET` | Secret | from step 2 |
| `STEAM_API_KEY` | Secret | from step 3 |
| `SESSION_SECRET` | Secret | from step 4 |
| `DISCORD_REQUIRED_ROLE_ID` | Text | *(optional)* |
| `DISCORD_WEBHOOK_URL` | Secret | *(optional)* webhook for #game-night, see "Discord posting" below |

Click **Deploy** after adding them.

**Trigger Events → Add → Cron Triggers**. Enter `17 * * * *`, which means every hour at :17.
This keeps everyone's libraries fresh and gradually fills in co-op/PvP info and prices for each game.

## Step 8: Check the Worker

Open your Worker URL in a browser. You should see:

```json
{"ok":true,"name":"burrito-game-night-api"}
```

## Step 9: Point the website at the Worker

1. Edit `js/config.js` in the website files:
   ```js
   API_BASE: 'https://burrito-game-night-api.YOURNAME.workers.dev',
   DISCORD_INVITE: 'https://discord.gg/YOUR-INVITE',
   ```
2. In GitHub go to **Add file → Upload files**, upload all the changed files and commit.
3. Wait about 1 minute, then open **gaymers.burritogang.com**. You should get the **Log in with Discord** screen.

## Step 10: First login

- Click **Log in with Discord** and approve. Discord shows exactly what's being asked for:
  - your profile
  - your Burrito Gang membership
  - your linked accounts, used only to find Steam
- If your Steam account is connected to your Discord profile, it links automatically.
- If not, paste your Steam profile link into the banner.
- If your Steam **Game details** are private, the banner tells you how to make them public, with a Resync button.

Brand-new libraries show straight away. Co-op/PvP tags and prices for each game fill in over the next few hours, starting with the games most people own. Opening a game's details fills that game in immediately.

---

## Discord posting (#game-night)

Pitches and "👍 We're playing this" rolls get posted to a channel through a webhook. No bot is needed.

1. In Discord, hover **#game-night** and click ⚙️ **Edit Channel**, then **Integrations → Webhooks → New Webhook**.
2. Name it **Game Night** (optionally give it the burrito as its picture), then click **Copy Webhook URL**.
3. In Cloudflare, go to **Worker → Settings → Variables and Secrets → Add**. Name it `DISCORD_WEBHOOK_URL`, choose type **Secret**, paste the URL, and click **Deploy**.

The webhook URL is a password for posting in that channel. Only ever paste it into Cloudflare.
- Pitches to specific people @mention them.
- Pitches to everyone and shuffle rolls don't ping anyone.

## Updating to a new version

1. **Worker:** go to **Edit code**, select all, paste the new `worker/src/index.js`, and click **Deploy**. The database upgrades itself on the next request, so you don't need the console.
2. **Website:** upload the changed files to GitHub. Keep your edited `js/config.js`, or re-enter your Worker URL in the new one.

## Troubleshooting

| You see | Fix |
|---|---|
| Discord says **"Invalid OAuth2 redirect_uri"** | The redirect in step 2 must exactly match `WORKER-URL/auth/callback` (https, no trailing slash). |
| **"Not in the Discord yet"** but you are | `DISCORD_GUILD_ID` is wrong. Copy the *server* ID, not a channel ID. |
| **"Something broke"** right after login | Check the Worker's **Logs** tab. Usually it's a missing or misspelled secret, or `DB` isn't bound. |
| Site stuck on login / "error" | `API_BASE` in `config.js` has a typo, or `FRONTEND_URL` doesn't exactly match `https://gaymers.burritogang.com`. |
| Someone's games don't appear | Their Steam **Game details** must be Public. They can hit **Resync** after changing it. |

## Free-plan limits (plenty for this group)

- Workers: 100,000 requests/day.
- D1: 5 GB storage, 100,000 row writes/day. A full resync of 20 people with ~500 games each is about 20k writes.
- The hourly job resyncs at most 4 people per run, so each library refreshes roughly every 20 hours.
