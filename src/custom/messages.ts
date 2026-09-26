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
  upNextTitle: 'Up next',
  upNextMore: (count: number) => `+${count} more`,
  upNextRequester: (user: string) => ` · ${user}`,

  // LIVIMUSE_DJ_ROLE restrictions
  djOnly: (role: string) => `you need the ${role} role to do that`,
  djOnlyPlayOptions: (role: string) => `you need the ${role} role to use skip or immediate with /play`,

  // Who pressed a card button: posted for skip/back/stop, and shown on
  // the card as "Last". `user` is a mention like <@123>; it never pings.
  byUser: (action: string, user: string) => `${action} by ${user}`,
  lastActionTitle: 'Last',
  actionSkipped: '⏭️ skipped',
  actionWentBack: '⏮️ went back',
  actionStopped: '⏹️ stopped',
  actionPaused: '⏸️ paused',
  actionResumed: '▶️ resumed',
  actionRewound: (seconds: number) => `⏪ rewound ${seconds}s`,
  actionForwarded: (seconds: number) => `⏩ forward ${seconds}s`,
  actionJumped: (time: string) => `🕒 jumped to ${time}`,
  actionVolumeDown: (level: number) => `🔉 volume ${level}%`,
  actionVolumeUp: (level: number) => `🔊 volume ${level}%`,
  volumeAtMin: 'volume is already at 0%',
  volumeAtMax: 'volume is already at 100%',

  // Vote skip (people without the DJ role)
  actionVoted: (count: number, needed: number) => `🗳️ voted to skip (${count}/${needed})`,
  skippedByVote: (count: number, needed: number) => `⏭️ skipped by vote (${count}/${needed})`,
  alreadyVoted: 'you already voted to skip this song',

  // Voice channel status (under the channel name in the sidebar)
  voiceStatusPlaying: (title: string) => `🎵 ${title}`,
  voiceStatusPaused: (title: string) => `⏸️ ${title}`,

  // Button labels and pop-ups on the card
  jumpToButton: 'Jump to',
  jumpToTitle: 'Jump to',
  jumpToField: 'Time (like 2:30)',
  controlsNotInVoice: 'join the voice channel to use these',
  controlsWrongChannel: 'join the bot\'s voice channel to use these',

  // `extra` is upstream's status suffix, e.g. " (resuming playback)" or " (1 song was not found)", or ''.
  songAdded: (title: string, toFront: boolean, skipped: boolean, extra: string) => `**${title}** added to the${toFront ? ' front of the' : ''} queue${skipped ? ' and current track skipped' : ''}${extra}`,
  songsAdded: (title: string, otherCount: number, skipped: boolean, extra: string) => `**${title}** and ${otherCount} other ${otherCount === 1 ? 'song was' : 'songs were'} added to the queue${skipped ? ' and current track skipped' : ''}${extra}`,
};
