# LiviMuse

A self-hosted Discord music bot with a live, button-driven player, DJ permissions, vote skip, and a tidy chat. It's built on [Muse](https://github.com/museofficial/muse) and adds a layer of features designed for groups of friends sharing one music channel.

```
Now Playing
keshi - B.Y.S.
Requested by: @tofuug
⏹ ▬▬▬🔘▬▬▬▬▬▬ [01:15/02:47] 🔉 12%

Up next
1. Weston Estate - Close The Door [3:52] · @udmse5838

Last
⏸️ paused by @tofuug

[⏮️] [⏪ 15s] [⏸️] [⏩ 15s] [⏭️ 1/2]
[🕒 Jump to] [🔉] [🔊] [⏹️]
```

---

## Credit

LiviMuse is a fork of **[Muse](https://github.com/museofficial/muse)**, created by **[Max Isom](https://github.com/codetheweb)** and now community-maintained under the [`museofficial`](https://github.com/museofficial) organization. The core of the bot comes from Muse and its contributors: playback, YouTube, Spotify, and SoundCloud support, caching, favorites, and the slash commands. Muse is MIT-licensed, and so is this fork; see [LICENSE](LICENSE).

If you want the original bot, use Muse. This fork exists to add the features below.

## Built with Claude

**Every change in this fork was written by [Claude](https://www.anthropic.com/claude)**, Anthropic's AI model, working in [Claude Code](https://claude.com/claude-code). That covers the features, the fixes, the build and sync pipelines, and this README. The repository owner directed the work, tested it on real servers, and decided what shipped. The code inherited from Muse was written by Muse's authors.

## Independent by design

LiviMuse doesn't depend on the Muse repository to run or to build:

- **The image is self-contained.** Everything the bot needs at runtime is inside `ghcr.io/adl101010/livimuse`. Nothing contacts the Muse project.
- **Builds use public registries only.** Docker Hub (Node base image), Debian (ffmpeg), npm (pinned by `yarn.lock`), and PyPI (yt-dlp). The full source lives in this repository.
- **yt-dlp stays current on its own.** It updates from PyPI at startup and then every 24 hours while running, so YouTube-side breakage is usually fixed without a rebuild. Admins can also update it, or switch to nightly builds, from Discord with `/ytdlp`.
- **Muse updates are optional.** A daily workflow merges new Muse releases when they appear. If Muse ever stops, the bot keeps working. The workflow would start failing, and you can disable it.

What no fork can avoid: YouTube and Discord change their platforms over time. Most YouTube changes are handled by the yt-dlp updates. Occasionally a platform change needs a dependency upgrade in this repository and a rebuild.

---

## What LiviMuse adds

### A live player card

- **Playback buttons.** Back, rewind 15s, pause/resume, forward 15s, skip, **🕒 Jump to**, volume down and up in 5% steps (🔉 🔊), and stop.
- **Live time.** The card refreshes every few seconds while a song plays.
- **Up next.** The next few songs, with their length and who queued them.
- **"Last" line.** Shows the most recent button press and who pressed it, for example "⏸️ paused by @someone".
- **Stays at the bottom.** When chat buries the card, the bot reposts it at the bottom once the channel goes quiet.
- **One card with buttons at a time.** Older cards lose their buttons when a newer one is posted.
- **`/controls`** posts a fresh card at any time.

### DJ role and permissions

- Set `LIVIMUSE_DJ_ROLE=DJ`. Members of that role, plus admins and anyone with Manage Server, can use every command and button.
- **Everyone else can only queue songs** with `/play`. They can't use `/play`'s skip or immediate options. You can open more commands with `LIVIMUSE_OPEN_COMMANDS`, for example `play,queue,now-playing`.
- **The role is matched by name** in every server, ignoring case, so one setting covers all your servers.
- Blocked actions get a private "🚫 you need the DJ role to do that". Nobody else sees it.

### Vote skip

- **Without the DJ role, ⏭️ counts as a vote.** The song skips once **more than half** of the listeners in the voice channel agree: 2 of 2, 2 of 3, 3 of 4. The button shows progress like **⏭️ 1/2**.
- **DJs skip instantly**, and so does whoever requested the song.
- Only people in the voice channel count, and votes reset when the song changes.

### Accountability

- Button actions are credited: "⏭️ skipped by @x", "⏹️ stopped by @x", "🗳️ voted to skip (1/2) by @x".
- Credited names never ping anyone.

### Voice channel status

- The current song appears under the voice channel's name in the sidebar: 🎵 while playing, ⏸️ while paused. It's cleared when playback stops.

### yt-dlp control from Discord

- **`/ytdlp status`** shows the installed version, the update channel, and the last update check.
- **`/ytdlp update`** checks for a newer release right away. It applies from the next song, with no restart.
- **`/ytdlp nightly`** switches to yt-dlp's nightly builds, where YouTube fixes usually land first. **`/ytdlp stable`** switches back to the latest stable release.
- The channel choice is saved in the data folder, so it survives restarts and image updates. The daily check follows it.
- Only server admins (Administrator or Manage Server) and the bot's owner can use it, because one yt-dlp serves every server the bot is in.

### Control API

- A small authenticated HTTP API lets a trusted local service play, pause, skip, stop, change the volume, and read the queue without Discord interactions. Bots can't run other bots' slash commands or click their buttons, so this is how an AI agent or home automation can control the music. Off unless you set a token. See [Control API](#control-api).

### Safe on a shared bot token

- Several programs can run on one Discord application and one token. LiviMuse only creates and updates its own slash commands, one at a time, and never touches the global scope or anyone else's commands. It ignores interactions that aren't its own, and only deletes messages it sent itself. See [Sharing a bot token](#sharing-a-bot-token-with-other-programs).

### Faster song changes

- **The next song is prepared ahead of time.** About 20 seconds into each song, the bot downloads and converts the next one into its cache, so it starts almost instantly when its turn comes.

### A tidy channel

- **Plain-text confirmations are deleted after 60 seconds.** That covers messages like "volume set to 30%", "paused", and "added to the queue".
- **Cards, embeds, and anything naming a person are kept.**

### Smaller fixes and changes

- **`/play` always posts a card.** Muse skipped it when the bot was already in voice with an empty queue.
- **Neutral reply wording**, all in one editable file (see [Customizing replies](#customizing-replies)).
- **Correct pluralization** of "1 other song".
- **Logging.** Card and update activity is logged with `[livimuse card]`, `[livimuse yt-dlp]`, and similar prefixes, to make problems easy to trace.

## Everything from Muse

- 🎥 Livestreams, ☁️ SoundCloud, and ↔️ Spotify links (converted to YouTube)
- ⏩ Seeking, 🔁 looping, 🔀 shuffling, and queue management
- 💾 Local caching, and ⭐ saved favorite queries
- 🔊 Volume control, with optional ducking when people speak
- 🧩 SponsorBlock skipping, one instance serving multiple servers, and a custom bot status

---

## Setup

### 1. Get the keys

- **`DISCORD_TOKEN`:** in the [Discord Developer Portal](https://discord.com/developers/applications), create a **New Application**, open **Bot**, and click **Reset Token**. Give LiviMuse **its own application**. Don't share a bot with other software, because each program overwrites the other's slash commands.
- **`YOUTUBE_API_KEY`:** in the [Google Cloud Console](https://console.developers.google.com), create a project, enable the **YouTube Data API v3**, and create an API key.
- **`SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`** (optional): from the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/applications). These enable Spotify links.

### 2. Run with Docker Compose

```yaml
services:
  livimuse:
    image: ghcr.io/adl101010/livimuse:latest
    restart: unless-stopped
    volumes:
      - ./data:/data
    environment:
      - DISCORD_TOKEN=
      - YOUTUBE_API_KEY=
      - SPOTIFY_CLIENT_ID=
      - SPOTIFY_CLIENT_SECRET=
      - YT_DLP_AUTO_UPDATE=true
      # - LIVIMUSE_DJ_ROLE=DJ
```

The same file is in the repo as [`docker-compose.yml`](docker-compose.yml), with every option listed. It works as-is in Dockge or Portainer.

### 3. Invite the bot

At startup, the log prints `Ready! Invite the bot with https://discordapp.com/oauth2/authorize?...`. Open that link to add the bot to a server. In each server, make sure it can:

| Permission | Why |
|---|---|
| Connect, Speak | Play music (requested by the invite link) |
| Send Messages, Embed Links | Repost the player card at the bottom of the channel |
| Set Voice Channel Status | Show the current song under the voice channel |

Missing permissions don't break anything. The related feature just stays off, and a warning appears in the log.

### 4. Check the startup log

One line summarizes the active settings:

```
LiviMuse now-playing card: card refresh 5s, repost after 3 messages + 5s quiet, up next 3, vote skip >50%, voice status on, preload next on, tidy after 60s, DJ role DJ, open commands /play
```

### Image tags

| Tag | Meaning |
|---|---|
| `latest` | The newest build |
| `2.11.8` | The newest build on that Muse version |
| `2.11.8-c20dee5` | One exact build. **Pin this to roll back** if an update misbehaves |

## Configuration

### LiviMuse settings

All are optional. Change a value, then restart the container.

| Variable | Default | What it does |
|---|---|---|
| `LIVIMUSE_DJ_ROLE` | *(off)* | Role name(s) with full control, e.g. `DJ` or `DJ,Music Mod`. Unset means everyone can do everything |
| `LIVIMUSE_OPEN_COMMANDS` | `play` | Commands everyone may use when the DJ role is on |
| `LIVIMUSE_VOTE_SKIP_PERCENT` | `50` | Non-DJ skips need votes from **more than** this % of listeners (`0` = any single vote, `100` = everyone) |
| `LIVIMUSE_CARD_REFRESH_SECONDS` | `5` | How often the card's time updates (minimum `2`) |
| `LIVIMUSE_REPOST_AFTER_MESSAGES` | `3` | Messages below the card before it moves to the bottom (`0` = never) |
| `LIVIMUSE_REPOST_QUIET_SECONDS` | `5` | How long chat must be quiet before reposting |
| `LIVIMUSE_UP_NEXT_COUNT` | `3` | Songs listed under "Up next" (`0` hides it, max `10`) |
| `LIVIMUSE_VOICE_STATUS` | `true` | Show the song under the voice channel name |
| `LIVIMUSE_PRELOAD_NEXT` | `true` | Prepare the next song while the current one plays |
| `LIVIMUSE_TIDY_SECONDS` | `60` | Delete plain-text confirmations after this long (`0` = keep them) |
| `LIVIMUSE_YT_DLP_UPDATE_HOURS` | `24` | Re-check yt-dlp while running (`0` = only at startup, max `168`). Needs `YT_DLP_AUTO_UPDATE=true` |
| `LIVIMUSE_API_TOKEN` | *(off)* | Bearer token for the [Control API](#control-api). The API doesn't listen at all until this is set |
| `LIVIMUSE_API_PORT` | `8787` | Port the Control API listens on (inside the container) |
| `LIVIMUSE_API_BIND` | `0.0.0.0` | Address the Control API binds to (inside the container) |

A value that isn't a number falls back to the default, and out-of-range values are clamped. The bot never crashes on a bad setting.

### Settings inherited from Muse

| Variable | What it does |
|---|---|
| `CACHE_LIMIT` | Maximum cache size, e.g. `5GB` (default `2GB`). A typical song is 3–5 MB |
| `YT_DLP_AUTO_UPDATE` | Update yt-dlp at startup. **Recommended: `true`** |
| `YT_DLP_COOKIES_PATH` | A YouTube cookie file for age-restricted videos. Mount it outside `/data`, and treat it like a password |
| `ENABLE_SPONSORBLOCK` / `SPONSORBLOCK_TIMEOUT` | Skip non-music intros and outros using [SponsorBlock](https://sponsor.ajay.app/) |
| `BOT_STATUS` / `BOT_ACTIVITY_TYPE` / `BOT_ACTIVITY` / `BOT_ACTIVITY_URL` | The bot's presence, e.g. `online` / `PLAYING` / `music` |
| `REGISTER_COMMANDS_ON_BOT` | **Ignored in LiviMuse.** Commands are always registered per server so they can't overwrite other programs' commands |
| `ENV_FILE` | Read variables from a file instead (default `/config`) |

Per-server options such as default volume, playlist limit, and ducking when people speak are set in Discord with `/config` (Manage Server only).

## Control API

An HTTP API for a trusted local service. It does nothing until `LIVIMUSE_API_TOKEN` is set, and it has no CORS headers and no HTML, only JSON.

```yaml
services:
  livimuse:
    image: ghcr.io/adl101010/livimuse:latest
    ports:
      - "8787:8787"
    environment:
      - LIVIMUSE_API_TOKEN=   # a long random string
```

**Keep it on your LAN.** The port gives full control of the music, so never forward it from your router or publish it to the internet. To limit it to one network interface, put the host's LAN address in front of the mapping, for example `"192.168.1.10:8787:8787"`, and firewall it to the machines that need it.

Generate a token with `openssl rand -hex 32`. Anyone who holds it can control the music in every server the bot is in, so keep it as secret as the Discord token, and don't publish the port beyond your LAN.

### Authentication and errors

- Send `Authorization: Bearer <token>` on every request except `GET /api/health`. A missing or wrong token is `401`.
- Request bodies are JSON (`Content-Type: application/json`), up to 16 KB.
- Errors look like `{"error": "<code>", "message": "<human readable>"}` with a status of `400` (bad request), `401`, `404` (not found), `405`, `409` (conflict with the current state), `413`, `415`, `500`, or `503` (still connecting to Discord).
- Every call is logged with its method, path, server and user. The token and request bodies are never logged.

### Routes

| Route | What it does |
|---|---|
| `GET /api/health` | `{"ok": true, "ready": true}`. No token needed. `ready` is false while the bot is still connecting |
| `GET /api/users/:userId/voice` | The server and voice channel a user is in, or `404`. `matches` lists every server if they're in voice in several |
| `GET /api/guilds/:guildId/status` | Connected channel, now playing (title, url, duration, position, requester), paused, loop, volume, and the first 25 queued songs plus the total |
| `POST /api/play` | Queue a song, playlist, link or search. Joins voice like `/play` |
| `POST /api/guilds/:guildId/pause` | Pause |
| `POST /api/guilds/:guildId/resume` | Resume (joins the user's voice channel if the bot isn't connected) |
| `POST /api/guilds/:guildId/skip` | Skip to the next song |
| `POST /api/guilds/:guildId/stop` | Stop and clear the queue |
| `POST /api/guilds/:guildId/disconnect` | Pause and leave voice, keeping the queue |
| `POST /api/guilds/:guildId/volume` | Body `{"value": 0-100}` |

The control routes take an optional `{"userId": "..."}` body so the change is credited on the player card's "Last" line. They bypass the DJ role, because the API token is the permission.

**`POST /api/play`** body:

| Field | Required | Meaning |
|---|---|---|
| `query` | yes | What to play: a search, a YouTube/Spotify/SoundCloud link or a playlist |
| `userId` | yes | Who is asking. The song is attributed to them |
| `guildId` | no | Which server. Needed when the user is in voice in more than one |
| `voiceChannelId` | no | Join this channel instead of the user's own |
| `textChannelId` | no | Post the now-playing card here. Without it the call is silent |
| `next` | no | Put it at the front of the queue |
| `shuffle` | no | Shuffle the added songs |

The voice channel is `voiceChannelId` if given, otherwise the channel `userId` is in (in `guildId` if given, otherwise any server). It returns `409 user_not_in_voice` if there isn't one, and `409 ambiguous_guild` (with the choices) if the user is in voice in several servers and no `guildId` was sent.

The response lists what was queued, with `position` `0` meaning now playing and `1` meaning next up, and the current status.

### Examples

```bash
TOKEN=...   # your LIVIMUSE_API_TOKEN
API=http://192.168.1.10:8787

# Is it up?
curl $API/api/health

# Where is a user?
curl -H "Authorization: Bearer $TOKEN" $API/api/users/111111111111111111/voice

# Play something where that user is, and post the card in a text channel
curl -X POST $API/api/play \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query": "daft punk one more time", "userId": "111111111111111111", "textChannelId": "666666666666666661"}'

# What's playing?
curl -H "Authorization: Bearer $TOKEN" $API/api/guilds/333333333333333333/status

# Skip, pause, and set the volume
curl -X POST -H "Authorization: Bearer $TOKEN" $API/api/guilds/333333333333333333/skip
curl -X POST -H "Authorization: Bearer $TOKEN" $API/api/guilds/333333333333333333/pause
curl -X POST $API/api/guilds/333333333333333333/volume \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"value": 20}'
```

## Sharing a bot token with other programs

Several programs can run on one Discord application and token, and then every one of them receives every interaction and posts as the same user. LiviMuse is built to coexist:

- **Commands.** At startup and when it joins a server, LiviMuse looks at the server's commands, then creates or overwrites **only its own**, one at a time, skipping any that are unchanged. It never reads, replaces or clears the global scope, and it only deletes names on its own list of retired commands. Other programs' commands are left alone, whatever order the programs start in. `REGISTER_COMMANDS_ON_BOT` is ignored for the same reason.
- **Interactions.** Slash commands, autocomplete and buttons that aren't LiviMuse's are ignored without a reply. Every LiviMuse button and pop-up id starts with `muse:`. Cards posted before that prefix existed (`livimuse:`) keep working.
- **Message tidying.** Auto-tidy only deletes messages this process sent, which it tracks as it sends them. It never deletes a message just because it was posted by the bot's user.

The other programs need to follow the same rules: register their own commands individually, and ignore interactions they don't own.

## Customizing replies

Every reply the bot sends is in [`src/custom/messages.ts`](src/custom/messages.ts): confirmations, error prefix, button labels, card text, vote-skip text, and voice status. Edit the text on the right-hand side and push. The image rebuilds automatically.

```ts
disconnected: 'disconnected',
errorPrefix: '🚫 ',
byUser: (action: string, user: string) => `${action} by ${user}`,
```

---

## How the fork is organized

All LiviMuse code lives in [`src/custom/`](src/custom/). Muse's own files are touched as little as possible, which keeps merges with new Muse releases clean.

| File | Purpose |
|---|---|
| `src/custom/messages.ts` | All reply wording |
| `src/custom/controls.ts` | Player card, buttons, live refresh, reposting |
| `src/custom/commands/controls.ts` | Button handling, the pop-ups, and `/controls` |
| `src/custom/permissions.ts` | DJ role checks on every command and button |
| `src/custom/vote-skip.ts` | Vote counting |
| `src/custom/voice-status.ts` | Voice channel status |
| `src/custom/preload.ts` | Preparing the next song |
| `src/custom/tidy.ts` | Deleting old confirmations |
| `src/custom/yt-dlp-updates.ts` | Daily yt-dlp updates |
| `src/custom/settings.ts` | All `LIVIMUSE_*` settings |
| `src/custom/command-registration.ts` | Ownership-aware slash command registration |
| `src/custom/ownership.ts` | Tracks which messages this process sent |
| `src/custom/api/` | The Control API: request handling (`handler.ts`), the HTTP server (`server.ts`), and the stand-in interaction `/play` runs against (`interaction.ts`) |
| `src/custom/commands/` | Add your own slash commands here. Copy `example.ts` and list it in `index.ts` |

Where Muse's files are changed, it's by small hooks, each marked with a `LiviMuse` comment:

- one-line reply swaps
- card hooks where the player card is sent
- a registration block in `src/inversify.config.ts`
- a cache helper and preload method in `src/services/player.ts`

### Build and sync pipelines

- **[`livimuse-build.yml`](.github/workflows/livimuse-build.yml)** runs on every push to `master`: type check, lint, and Muse's test suite, then it publishes the image. Muse's tests run against Muse's original wording and without the buttons (see `vitest.config.ts`), so changing replies can never fail the build.
- **[`livimuse-sync.yml`](.github/workflows/livimuse-sync.yml)** runs daily and merges the newest Muse release. It pushes with a `SYNC_TOKEN` repository secret: a fine-grained token with Contents and Workflows write access to this repository. On a conflict it stops, pushes nothing, and fails so GitHub emails you. The running bot is unaffected.

Resolving a sync conflict locally:

```bash
git fetch upstream --tags
git merge vX.Y.Z
```

Fix the files it lists (usually by keeping both sides), commit, and push. This README is always kept as-is during merges (see `.gitattributes`).

### Running without Docker

You need Node.js 22.12+, ffmpeg, and `yt-dlp[default]` on your `PATH`. Copy `.env.example` to `.env`, fill it in, then run `yarn install` and `yarn start`.

### Troubleshooting

- **The card has no buttons or stopped updating.** Check the log for `[livimuse card]` lines. They say which card is live and why one was replaced or failed.
- **The voice channel status doesn't appear.** Give the bot Set Voice Channel Status in that channel. There's a `[livimuse voice-status]` warning in the log.
- **YouTube songs fail.** Run `/ytdlp update`, or restart the container, to pull the newest yt-dlp immediately. If the latest stable release is still broken, try `/ytdlp nightly`. For age-restricted videos, set up `YT_DLP_COOKIES_PATH`.
- **The bot can't join voice.** Muse's log reports the voice state. `OpeningWs` points to outbound TCP to Discord's voice port. `UdpHandshaking` points to outbound UDP and return traffic through your firewall or NAT.

## License

MIT, same as Muse. Original work © 2020 Max Isom and Muse contributors; see [LICENSE](LICENSE).
