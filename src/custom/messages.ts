// LiviMuse: every chat reply we've customized lives here, so upstream merges
// only ever touch one line per command. Edit the text on the right-hand side.
// `**text**` is bold in Discord.

export const messages = {
  // Put in front of every error, e.g. "🚫 nothing is playing". Keep the trailing space.
  errorPrefix: '🚫 ',
  unknownError: 'unknown error',

  disconnected: 'disconnected',
  stopped: 'stopped',
  paused: 'paused',
  resumed: 'resumed',
  skipped: 'skipped',
  unskipped: 'unskipped',
  cleared: 'cleared',
  shuffled: 'shuffled',
  removed: 'removed',
  replayed: 'replayed the current song',
  seeked: (position: string) => `seeked to ${position}`,
  moved: (title: string, position: number) => `moved **${title}** to position **${position}**`,
  volumeSet: (level: number) => `volume set to ${level}%`,

  loopOn: 'looping song',
  loopOff: 'stopped looping song',
  loopQueueOn: 'looping queue',
  loopQueueOff: 'stopped looping queue',

  noFavorites: 'there aren\'t any favorites yet',
  favoriteCreated: 'favorite created',
  favoriteRemoved: 'favorite removed',

  // Playback buttons on the "now playing" card
  cardEnds: 'Ends',
  jumpToButton: 'Jump to',
  jumpToTitle: 'Jump to',
  jumpToField: 'Time (like 2:30)',
  controlsNotInVoice: 'join the voice channel to use these',
  controlsWrongChannel: 'join the bot\'s voice channel to use these',

  // `extra` is upstream's status suffix, e.g. " (resuming playback)" or " (1 song was not found)", or ''.
  songAdded: (title: string, toFront: boolean, skipped: boolean, extra: string) => `**${title}** added to the${toFront ? ' front of the' : ''} queue${skipped ? ' and current track skipped' : ''}${extra}`,
  songsAdded: (title: string, otherCount: number, skipped: boolean, extra: string) => `**${title}** and ${otherCount} other ${otherCount === 1 ? 'song was' : 'songs were'} added to the queue${skipped ? ' and current track skipped' : ''}${extra}`,
};
