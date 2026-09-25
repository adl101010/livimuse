// LiviMuse: prepare the next song while the current one plays, so it starts
// from the local cache instead of waiting on yt-dlp and a download. Waits until
// the current song has played for a bit so the two downloads don't overlap, and
// only works on one song per server at a time.
import {Client} from 'discord.js';
import type Player from '../services/player.js';
import {STATUS} from '../services/player-types.js';
import {preloadNextEnabled} from './settings.js';

const CHECK_MS = 5000;
const START_AFTER_SECONDS = 20;

// Per server: the song URL we last handled, and whether a preload is running.
const state = new Map<string, {url?: string; busy: boolean}>();
let started = false;

const check = (guildId: string, player: Player) => {
  const current = player.getCurrent();
  const next = player.getQueue()[0];

  if (!current || !next || player.status !== STATUS.PLAYING || player.loopCurrentSong) {
    return;
  }

  if (player.getPosition() < START_AFTER_SECONDS) {
    return;
  }

  const entry = state.get(guildId) ?? {busy: false};
  state.set(guildId, entry);

  if (entry.busy || entry.url === next.url) {
    return;
  }

  entry.url = next.url;
  entry.busy = true;

  player.preloadIntoCache(next)
    .then(prepared => {
      if (prepared) {
        console.log(`[livimuse preload] ready: ${next.title}`);
      }
    })
    .catch((error: unknown) => {
      // Playback will just fetch it normally when the song comes up.
      console.warn(`[livimuse preload] couldn't prepare ${next.title}: ${error instanceof Error ? error.message : String(error)}`);
    })
    .finally(() => {
      entry.busy = false;
    });
};

export const startPreloading = (client: Client, lookup: (guildId: string) => Player): void => {
  if (started || !preloadNextEnabled()) {
    return;
  }

  started = true;

  setInterval(() => {
    for (const guild of client.guilds.cache.values()) {
      if (guild.members.me?.voice.channelId) {
        check(guild.id, lookup(guild.id));
      }
    }
  }, CHECK_MS).unref();
};
