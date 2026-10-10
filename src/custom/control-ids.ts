// LiviMuse: component ids for the player card's buttons and pop-ups. Kept in a
// module of their own, with no imports, so they can be used (and tested)
// without loading the player.
// Every component id LiviMuse creates starts with this. The bot token can be shared
// with other programs that see every interaction, and ids without this prefix are
// ignored, so we never answer (or break) someone else's buttons.
export const CONTROL_PREFIX = 'muse:';

// Cards posted before the prefix changed carry these ids; they keep working.
const LEGACY_CONTROL_PREFIX = 'livimuse:';

export const controlIds = {
  back: `${CONTROL_PREFIX}back`,
  rewind: `${CONTROL_PREFIX}rewind`,
  playPause: `${CONTROL_PREFIX}play-pause`,
  forward: `${CONTROL_PREFIX}forward`,
  skip: `${CONTROL_PREFIX}skip`,
  jump: `${CONTROL_PREFIX}jump`,
  volumeDown: `${CONTROL_PREFIX}volume-down`,
  volumeUp: `${CONTROL_PREFIX}volume-up`,
  stop: `${CONTROL_PREFIX}stop`,
};

export const legacyControlIds: string[] = Object.values(controlIds).map(id => LEGACY_CONTROL_PREFIX + id.slice(CONTROL_PREFIX.length));

// Maps an id from a card posted before the prefix changed to its current id.
export const canonicalControlId = (customId: string): string => (customId.startsWith(LEGACY_CONTROL_PREFIX)
  ? CONTROL_PREFIX + customId.slice(LEGACY_CONTROL_PREFIX.length)
  : customId);
