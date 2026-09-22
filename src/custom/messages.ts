// LiviMuse: every chat reply we've customized lives here, so upstream merges
// only ever touch one line per command. Edit the text on the right-hand side.
// `**text**` is bold in Discord.

export const messages = {
  disconnected: 'u betcha, disconnected',
  stopped: 'u betcha, stopped',
  paused: 'the stop-and-go light is now red',
  cleared: 'clearer than a field after a fresh harvest',
  shuffled: 'shuffled',
  removed: ':wastebasket: removed',
  replayed: '👍 replayed the current song',
  seeked: (position: string) => `👍 seeked to ${position}`,
  moved: (title: string, position: number) => `moved **${title}** to position **${position}**`,
  volumeSet: (level: number) => `Set volume to ${level}%`,

  loopOn: 'looped :)',
  loopOff: 'stopped looping :(',
  loopQueueOn: 'looped queue :)',
  loopQueueOff: 'stopped looping queue :(',

  noFavorites: 'there aren\'t any favorites yet',
  favoriteCreated: '👍 favorite created',
  favoriteRemoved: '👍 favorite removed',

  // `extra` is upstream's status suffix, e.g. " (resuming playback)" or " (1 song was not found)", or ''.
  songAdded: (title: string, toFront: boolean, skipped: boolean, extra: string) => `u betcha, **${title}** added to the${toFront ? ' front of the' : ''} queue${skipped ? ' and current track skipped' : ''}${extra}`,
  songsAdded: (title: string, otherCount: number, skipped: boolean, extra: string) => `u betcha, **${title}** and ${otherCount} other songs were added to the queue${skipped ? ' and current track skipped' : ''}${extra}`,
};
