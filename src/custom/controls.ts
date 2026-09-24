// LiviMuse: the "now playing" card with playback buttons and a live-updating
// time. Upstream code spreads withControls() into each card it sends and passes
// the sent message to trackCard(). Only the newest card per server keeps its
// buttons and gets refreshed. Button presses are handled in ./commands/controls.ts.
import {ActionRowData, ButtonStyle, ComponentType, InteractionButtonComponentData, Message} from 'discord.js';
import type Player from '../services/player.js';
import {STATUS} from '../services/player-types.js';
import {buildPlayingMessageEmbed} from '../utils/build-embed.js';
import {messages} from './messages.js';

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


// The card: Muse's embed, plus a live "Ends in ..." timestamp while playing
// (Discord counts it down on each viewer's screen), plus the buttons.
export const buildCard = (player: Player) => {
  const embed = buildPlayingMessageEmbed(player);
  const song = player.getCurrent();

  if (song && !song.isLive && player.status === STATUS.PLAYING) {
    const endsAt = Math.round((Date.now() / 1000) + song.length - player.getPosition());
    embed.addFields({name: messages.cardEnds, value: `<t:${endsAt}:R>`, inline: true});
  }

  return {embeds: [embed], components: buildControlRows(player)};
};

// Spread after `embeds:` in a card's message options. Adds nothing when no song is playing.
export const withControls = (player: Player) => (player.getCurrent() ? buildCard(player) : {});

export const CARD_REFRESH_MS = 5000;

type LiveCard = {
  message: Message;
  timer?: NodeJS.Timeout;
  inFlight?: Promise<void>;
  lastState?: string;
};

const liveCards = new Map<string, LiveCard>();
let lookupPlayer: ((guildId: string) => Player) | undefined;

// Called once at startup so the refresh timer can find each server's player.
export const enableLiveCards = (lookup: (guildId: string) => Player): void => {
  lookupPlayer = lookup;
};

// Anything besides the position that would change what the card shows.
const cardState = (player: Player) => [
  player.status,
  player.getCurrentQueueEntryId(),
  player.loopCurrentSong,
  player.loopCurrentQueue,
  player.getVolume(),
].join(':');

const stopTimer = (card: LiveCard) => {
  if (card.timer) {
    clearInterval(card.timer);
    card.timer = undefined;
  }
};

export const forgetCard = (guildId: string): void => {
  const card = liveCards.get(guildId);

  if (card) {
    stopTimer(card);
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
      forgetCard(guildId);
      await card.message.edit({components: []});
    }
  } catch {
    // Deleted, ephemeral, or no longer editable.
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

const startTimer = (guildId: string, card: LiveCard) => {
  stopTimer(card);
  card.timer = setInterval(() => {
    refresh(guildId);
  }, CARD_REFRESH_MS);
  card.timer.unref();
};

// Remember the newest card per server, keep it refreshed, and strip the buttons
// off the previous one.
export const trackCard = (sent: unknown): void => {
  if (!(sent instanceof Message) || !sent.guildId || sent.components.length === 0) {
    return;
  }

  const previous = liveCards.get(sent.guildId);

  if (previous?.message.id === sent.id) {
    return;
  }

  if (previous) {
    stopTimer(previous);
    previous.message.edit({components: []}).catch(() => undefined);
  }

  const card: LiveCard = {message: sent};
  liveCards.set(sent.guildId, card);
  startTimer(sent.guildId, card);
};

// Button presses edit the card themselves. Pause the timer around them and let
// any refresh already on its way land first, so it can't overwrite the press.
export const withCardLock = async (guildId: string, action: () => Promise<void>): Promise<void> => {
  const card = liveCards.get(guildId);

  if (card) {
    stopTimer(card);
    await card.inFlight;
  }

  try {
    await action();
  } finally {
    if (card && liveCards.get(guildId) === card) {
      startTimer(guildId, card);
    }
  }
};
