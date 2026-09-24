// LiviMuse: playback buttons under the "now playing" card. Upstream code calls
// withControls() when building a card and trackCard() with the sent message, so
// only the newest card in each server keeps its buttons. The button presses
// themselves are handled in ./commands/controls.ts.
import {ActionRowBuilder, ButtonBuilder, ButtonStyle, Message, MessageActionRowComponentBuilder} from 'discord.js';
import type Player from '../services/player.js';
import {STATUS} from '../services/player-types.js';
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

const button = (customId: string, emoji: string, label?: string) => {
  const built = new ButtonBuilder().setCustomId(customId).setEmoji(emoji).setStyle(ButtonStyle.Secondary);
  return label ? built.setLabel(label) : built;
};

export const buildControlRows = (player: Player): Array<ActionRowBuilder<MessageActionRowComponentBuilder>> => [
  new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    button(controlIds.back, '⏮️'),
    button(controlIds.rewind, '⏪', `${SEEK_STEP_SECONDS}s`),
    button(controlIds.playPause, player.status === STATUS.PLAYING ? '⏸️' : '▶️'),
    button(controlIds.forward, '⏩', `${SEEK_STEP_SECONDS}s`),
    button(controlIds.skip, '⏭️'),
  ),
  new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    button(controlIds.jump, '🕒', messages.jumpToButton),
    button(controlIds.shuffle, '🔀'),
    button(controlIds.loop, '🔁'),
    button(controlIds.stop, '⏹️'),
  ),
];

// Spread into a card's message options. Adds nothing when no song is playing.
export const withControls = (player: Player) => (player.getCurrent() ? {components: buildControlRows(player)} : {});

const latestCards = new Map<string, Message>();

// Remember the newest card per server and strip the buttons off the previous one.
export const trackCard = (sent: unknown): void => {
  if (!(sent instanceof Message) || !sent.guildId || sent.components.length === 0) {
    return;
  }

  const previous = latestCards.get(sent.guildId);
  latestCards.set(sent.guildId, sent);

  if (previous && previous.id !== sent.id) {
    previous.edit({components: []}).catch(() => undefined);
  }
};

export const forgetCard = (guildId: string): void => {
  latestCards.delete(guildId);
};
