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
- **yt-dlp stays current on its own.** It updates from PyPI at startup and then every 24 hours while running, so YouTube-side breakage is usually fixed without a rebuild.
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

A value that isn't a number falls back to the default, and out-of-range values are clamped. The bot never crashes on a bad setting.

### Settings inherited from Muse

| Variable | What it does |
|---|---|
| `CACHE_LIMIT` | Maximum cache size, e.g. `5GB` (default `2GB`). A typical song is 3–5 MB |
| `YT_DLP_AUTO_UPDATE` | Update yt-dlp at startup. **Recommended: `true`** |
| `YT_DLP_COOKIES_PATH` | A YouTube cookie file for age-restricted videos. Mount it outside `/data`, and treat it like a password |
| `ENABLE_SPONSORBLOCK` / `SPONSORBLOCK_TIMEOUT` | Skip non-music intros and outros using [SponsorBlock](https://sponsor.ajay.app/) |
| `BOT_STATUS` / `BOT_ACTIVITY_TYPE` / `BOT_ACTIVITY` / `BOT_ACTIVITY_URL` | The bot's presence, e.g. `online` / `PLAYING` / `music` |
| `REGISTER_COMMANDS_ON_BOT` | Register commands globally instead of per server. Useful for 10+ servers; updates can take up to an hour |
| `ENV_FILE` | Read variables from a file instead (default `/config`) |

Per-server options such as default volume, playlist limit, and ducking when people speak are set in Discord with `/config` (Manage Server only).

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
- **YouTube songs fail.** Restart the container to pull the newest yt-dlp immediately. For age-restricted videos, set up `YT_DLP_COOKIES_PATH`.
- **The bot can't join voice.** Muse's log reports the voice state. `OpeningWs` points to outbound TCP to Discord's voice port. `UdpHandshaking` points to outbound UDP and return traffic through your firewall or NAT.

## License

MIT, same as Muse. Original work © 2020 Max Isom and Muse contributors; see [LICENSE](LICENSE).
