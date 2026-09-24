// LiviMuse: the "now playing" card with playback buttons and a live-updating
// time. Upstream code spreads withControls() into each card it sends and passes
// the sent message to trackCard(). Only the newest card per server keeps its
// buttons and gets refreshed. Button presses are handled in ./commands/controls.ts.
import {
  ActionRowData,
  ButtonStyle,
  Client,
  ComponentType,
  escapeMarkdown,
  InteractionButtonComponentData,
  Message,
} from 'discord.js';
import type Player from '../services/player.js';
import {STATUS} from '../services/player-types.js';
import {buildPlayingMessageEmbed} from '../utils/build-embed.js';
import {truncate} from '../utils/string.js';
import {prettyTime} from '../utils/time.js';
import {messages} from './messages.js';
import {cardRefreshMs, describeSettings, repostAfterMessages, repostQuietMs, upNextCount} from './settings.js';

// Card lifecycle events go to the container log to make problems traceable.
const log = (event: string, details: Record<string, unknown> = {}) => {
  const parts = Object.entries(details).map(([key, value]) => `${key}=${String(value)}`);
  console.log(`[livimuse card] ${event}${parts.length > 0 ? ' ' + parts.join(' ') : ''}`);
};

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const CONTROL_PREFIX = 'livimuse:';

export const controlIds = {
  back: `${CONTROL_PREFIX}back`,
  rewind: `${CONTROL_PREFIX}rewind`,
  playPause: `${CONTROL_PREFIX}play-pause`,
  forward: `${CONTROL_PREFIX}forward`,
  skip: `${CONTROL_PREFIX}skip`,
  jump: `${CONTROL_PREFIX}jump`,
  shuffle: `${CONTROL_PREFIX}shuffle`,
  loop: `${CONTROL_PREFIX}loop`,
  stop: `${CONTROL_PREFIX}stop`,
};

export const SEEK_STEP_SECONDS = 15;

// Plain data objects rather than ButtonBuilder: discord.js 14.11's builders are
// typed against a different discord-api-types version and fail to compile.
const button = (customId: string, emoji: string, label?: string): InteractionButtonComponentData => ({
  type: ComponentType.Button,
  style: ButtonStyle.Secondary,
  customId,
  emoji,
  ...(label ? {label} : {}),
});

const row = (...components: InteractionButtonComponentData[]): ActionRowData<InteractionButtonComponentData> => ({
  type: ComponentType.ActionRow,
  components,
});

export const buildControlRows = (player: Player): Array<ActionRowData<InteractionButtonComponentData>> => [
  row(
    button(controlIds.back, '⏮️'),
    button(controlIds.rewind, '⏪', `${SEEK_STEP_SECONDS}s`),
    button(controlIds.playPause, player.status === STATUS.PLAYING ? '⏸️' : '▶️'),
    button(controlIds.forward, '⏩', `${SEEK_STEP_SECONDS}s`),
    button(controlIds.skip, '⏭️'),
  ),
  row(
    button(controlIds.jump, '🕒', messages.jumpToButton),
    button(controlIds.shuffle, '🔀'),
    button(controlIds.loop, '🔁'),
    button(controlIds.stop, '⏹️'),
  ),
];

// Rows like "`1.` Song title `[3:07]`", like /queue but without links to keep the card compact.
const upNextLines = (player: Player) => {
  const queue = player.getQueue();
  const count = upNextCount();
  const lines = queue.slice(0, count).map((song, index) => {
    const title = escapeMarkdown(truncate(song.title.replace(/\[.*\]/, '').trim(), 48));
    const duration = song.isLive ? 'live' : prettyTime(song.length);
    return `\`${index + 1}.\` ${title} \`[${duration}]\`${messages.upNextRequester(`<@${song.requestedBy}>`)}`;
  });

  if (count > 0 && queue.length > count) {
    lines.push(messages.upNextMore(queue.length - count));
  }

  return lines;
};

const lastActions = new Map<string, string>();

// Shown on the card as "Last: ⏸️ paused by @someone" until the next button press.
export const setLastAction = (guildId: string, action: string, userId: string): string => {
  const text = messages.byUser(action, `<@${userId}>`);
  lastActions.set(guildId, text);
  return text;
};

export const clearLastAction = (guildId: string): void => {
  lastActions.delete(guildId);
};

// The card: Muse's embed, the next few songs, the last button press, and the buttons.
export const buildCard = (player: Player) => {
  const embed = buildPlayingMessageEmbed(player);
  const upNext = upNextLines(player);

  if (upNext.length > 0) {
    embed.addFields({name: messages.upNextTitle, value: upNext.join('\n')});
  }

  const lastAction = lastActions.get(player.guildId);

  if (lastAction) {
    embed.addFields({name: messages.lastActionTitle, value: lastAction});
  }

  return {embeds: [embed], components: buildControlRows(player)};
};

// Spread after `embeds:` in a card's message options. Adds nothing when no song is playing.
export const withControls = (player: Player) => (player.getCurrent() ? buildCard(player) : {});

type LiveCard = {
  message: Message;
  timer?: NodeJS.Timeout;
  inFlight?: Promise<void>;
  lastState?: string;
  messagesSince: number;
  repostTimer?: NodeJS.Timeout;
};

const liveCards = new Map<string, LiveCard>();
let lookupPlayer: ((guildId: string) => Player) | undefined;

// Anything besides the position that would change what the card shows.
const cardState = (player: Player) => [
  player.status,
  player.getCurrentQueueEntryId(),
  player.loopCurrentSong,
  player.loopCurrentQueue,
  player.getVolume(),
  player.getQueue().slice(0, upNextCount() + 1).map(song => song.url).join(','),
  lastActions.get(player.guildId),
].join(':');

const stopTimers = (card: LiveCard) => {
  if (card.timer) {
    clearInterval(card.timer);
    card.timer = undefined;
  }

  if (card.repostTimer) {
    clearTimeout(card.repostTimer);
    card.repostTimer = undefined;
  }
};

export const forgetCard = (guildId: string): void => {
  const card = liveCards.get(guildId);

  if (card) {
    stopTimers(card);
    liveCards.delete(guildId);
  }
};

const editCard = async (guildId: string, card: LiveCard, player: Player) => {
  try {
    if (player.getCurrent()) {
      card.lastState = cardState(player);
      await card.message.edit(buildCard(player));
    } else {
      // Queue finished: leave the last song up, without buttons.
      log('queue finished, removing buttons', {message: card.message.id});
      forgetCard(guildId);
      await card.message.edit({components: []});
    }
  } catch (error: unknown) {
    // Deleted, ephemeral, or no longer editable.
    log('refresh failed, card no longer live', {message: card.message.id, error: errorText(error)});
    forgetCard(guildId);
  }
};

const refresh = (guildId: string) => {
  const card = liveCards.get(guildId);
  const player = lookupPlayer?.(guildId);

  if (!card || !player || card.inFlight) {
    return;
  }

  // While paused nothing moves, so only edit when something else changed.
  if (player.status !== STATUS.PLAYING && card.lastState === cardState(player)) {
    return;
  }

  card.inFlight = editCard(guildId, card, player).finally(() => {
    card.inFlight = undefined;
  });
};

const startRefreshTimer = (guildId: string, card: LiveCard) => {
  if (card.timer) {
    clearInterval(card.timer);
  }

  card.timer = setInterval(() => {
    refresh(guildId);
  }, cardRefreshMs());
  card.timer.unref();
};

const makeLive = (message: Message) => {
  const card: LiveCard = {message, messagesSince: 0};
  log('live', {message: message.id, channel: message.channelId});
  liveCards.set(message.guildId!, card);
  startRefreshTimer(message.guildId!, card);
};

// Post a fresh copy at the bottom of the same channel, then delete the old one.
const repost = async (guildId: string, card: LiveCard) => {
  const player = lookupPlayer?.(guildId);

  if (liveCards.get(guildId) !== card || !player?.getCurrent()) {
    return;
  }

  stopTimers(card);
  await card.inFlight;

  try {
    const fresh = await card.message.channel.send(buildCard(player));

    if (liveCards.get(guildId) !== card) {
      // A new card was posted while we were sending; this copy is redundant.
      await fresh.delete().catch(() => undefined);
      return;
    }

    log('reposted', {old: card.message.id, new: fresh.id});
    makeLive(fresh);
    await card.message.delete().catch(() => undefined);
  } catch (error: unknown) {
    log('repost failed, keeping old card', {message: card.message.id, error: errorText(error)});
    // Probably missing Send Messages / Embed Links here: keep the old card.
    if (liveCards.get(guildId) === card) {
      card.messagesSince = 0;
      startRefreshTimer(guildId, card);
    }
  }
};

const onMessageCreate = (message: Message) => {
  const {guildId} = message;

  if (!guildId) {
    return;
  }

  const card = liveCards.get(guildId);

  if (!card || message.channelId !== card.message.channelId || message.id === card.message.id) {
    return;
  }

  card.messagesSince++;

  // Repost once enough messages are below the card (setting 0 turns this off).
  const threshold = repostAfterMessages();

  if (threshold === 0 || card.messagesSince < threshold) {
    return;
  }

  // Wait for a quiet moment so a burst of messages causes one repost.
  if (card.repostTimer) {
    clearTimeout(card.repostTimer);
  }

  card.repostTimer = setTimeout(() => {
    card.repostTimer = undefined;
    void repost(guildId, card);
  }, repostQuietMs());
  card.repostTimer.unref();
};

let listening = false;

// Called once at startup: how to find each server's player, and the client to
// watch for new messages burying the card.
export const enableLiveCards = (lookup: (guildId: string) => Player, client: Client): void => {
  lookupPlayer = lookup;

  if (!listening) {
    listening = true;
    client.on('messageCreate', onMessageCreate);
    console.log(`LiviMuse now-playing card: ${describeSettings()}`);
  }
};

// Remember the newest card per server, keep it refreshed, and strip the buttons
// off the previous one. A card nobody asked for (auto-announce) doesn't take
// over from a live card in another channel; it just loses its buttons.
export const trackCard = (sent: unknown): void => {
  if (!(sent instanceof Message) || !sent.guildId || sent.components.length === 0) {
    return;
  }

  const message = sent as Message;
  const previous = liveCards.get(message.guildId!);

  if (previous?.message.id === message.id) {
    return;
  }

  const fromCommand = Boolean(message.interaction ?? message.webhookId);

  if (previous && !fromCommand && previous.message.channelId !== message.channelId) {
    log('announce card in another channel, removing its buttons', {message: message.id, channel: message.channelId, live: previous.message.id});
    message.edit({components: []}).catch(() => undefined);
    return;
  }

  if (previous) {
    log('replaced, removing buttons', {old: previous.message.id, new: message.id, fromCommand});
    stopTimers(previous);
    previous.message.edit({components: []}).catch(() => undefined);
  }

  makeLive(message);
};

// Button presses edit the card themselves. Pause the timer around them and let
// any refresh already on its way land first, so it can't overwrite the press.
export const withCardLock = async (guildId: string, action: () => Promise<void>): Promise<void> => {
  const card = liveCards.get(guildId);

  if (card?.timer) {
    clearInterval(card.timer);
    card.timer = undefined;
  }

  await card?.inFlight;

  try {
    await action();
  } finally {
    if (card && liveCards.get(guildId) === card) {
      startRefreshTimer(guildId, card);
    }
  }
};
