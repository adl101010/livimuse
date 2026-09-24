// LiviMuse: optional environment variables for the now-playing card. Read when
// used rather than at import, so they always see the container's environment.
// A missing or non-numeric value falls back to the default.

const envNumber = (name: string, fallback: number, min: number, max: number) => {
  const raw = process.env[name]?.trim();

  if (!raw) {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(value, min), max);
};

// How often the card's time updates. At least 2s to stay clear of Discord's edit limits.
export const cardRefreshMs = () => envNumber('LIVIMUSE_CARD_REFRESH_SECONDS', 5, 2, 3600) * 1000;

// Messages posted below the card before it reposts at the bottom. 0 = never repost.
export const repostAfterMessages = () => Math.round(envNumber('LIVIMUSE_REPOST_AFTER_MESSAGES', 3, 0, 1000));

// How long the channel must be quiet before reposting.
export const repostQuietMs = () => envNumber('LIVIMUSE_REPOST_QUIET_SECONDS', 5, 1, 3600) * 1000;

// Songs listed under "Up next". 0 = hide the section.
export const upNextCount = () => Math.round(envNumber('LIVIMUSE_UP_NEXT_COUNT', 3, 0, 10));

export const describeSettings = () => [
  `card refresh ${cardRefreshMs() / 1000}s`,
  repostAfterMessages() === 0 ? 'repost off' : `repost after ${repostAfterMessages()} messages + ${repostQuietMs() / 1000}s quiet`,
  `up next ${upNextCount()}`,
].join(', ');
