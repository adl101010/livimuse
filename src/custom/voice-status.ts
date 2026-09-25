// LiviMuse: show the current song as the voice channel's status (the line under
// its name in the sidebar). Checked every few seconds and only sent to Discord
// when it changes. Needs the Set Voice Channel Status permission; without it the
// bot logs one warning per channel and carries on.
import {Client} from 'discord.js';
import type Player from '../services/player.js';
import {STATUS} from '../services/player-types.js';
import {truncate} from '../utils/string.js';
import {messages} from './messages.js';
import {voiceStatusEnabled} from './settings.js';

const CHECK_MS = 5000;

const lastStatus = new Map<string, {channelId: string; status: string}>();
const warnedChannels = new Set<string>();
let client: Client | undefined;
let started = false;

const statusFor = (player: Player): string => {
  const song = player.getCurrent();

  if (!song || player.status === STATUS.IDLE) {
    return '';
  }

  const title = truncate(song.title, 100);
  return player.status === STATUS.PLAYING ? messages.voiceStatusPlaying(title) : messages.voiceStatusPaused(title);
};

const putStatus = async (channelId: string, status: string) => {
  if (!client) {
    return;
  }

  try {
    await client.rest.put(`/channels/${channelId}/voice-status`, {body: {status}});
    warnedChannels.delete(channelId);
  } catch (error: unknown) {
    if (!warnedChannels.has(channelId)) {
      warnedChannels.add(channelId);
      console.warn(`[livimuse voice-status] couldn't set status in channel ${channelId} (missing Set Voice Channel Status permission?): ${error instanceof Error ? error.message : String(error)}`);
    }
  }
};

const sync = async (lookup: (guildId: string) => Player) => {
  if (!client) {
    return;
  }

  const active = new Set<string>();

  for (const guild of client.guilds.cache.values()) {
    const channelId = guild.members.me?.voice.channelId;

    if (!channelId) {
      continue;
    }

    active.add(guild.id);
    const status = statusFor(lookup(guild.id));
    const last = lastStatus.get(guild.id);

    if (last?.channelId === channelId && last.status === status) {
      continue;
    }

    if (last && last.channelId !== channelId && last.status) {
      // eslint-disable-next-line no-await-in-loop
      await putStatus(last.channelId, '');
    }

    lastStatus.set(guild.id, {channelId, status});
    // eslint-disable-next-line no-await-in-loop
    await putStatus(channelId, status);
  }

  // The bot left voice: clear what it set (Discord may also clear it once the channel empties).
  for (const [guildId, last] of lastStatus) {
    if (!active.has(guildId)) {
      lastStatus.delete(guildId);

      if (last.status) {
        // eslint-disable-next-line no-await-in-loop
        await putStatus(last.channelId, '');
      }
    }
  }
};

// Clear right away, e.g. before the stop button disconnects the bot.
export const clearVoiceStatus = async (guildId: string): Promise<void> => {
  const last = lastStatus.get(guildId);

  if (last?.status) {
    lastStatus.set(guildId, {...last, status: ''});
    await putStatus(last.channelId, '');
  }
};

export const startVoiceStatus = (discordClient: Client, lookup: (guildId: string) => Player): void => {
  if (started || !voiceStatusEnabled()) {
    return;
  }

  started = true;
  client = discordClient;

  let running = false;
  setInterval(() => {
    if (running) {
      return;
    }

    running = true;
    sync(lookup).catch(() => undefined).finally(() => {
      running = false;
    });
  }, CHECK_MS).unref();
};
