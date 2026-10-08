// LiviMuse: yt-dlp update channel (stable or nightly), manual updates for
// /ytdlp, and the daily update while the bot runs. Muse already updates yt-dlp
// at startup (YT_DLP_AUTO_UPDATE=true), but only on stable. yt-dlp runs fresh for
// each song, so a new version applies from the next song on.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execa} from 'execa';
import {DATA_DIR} from '../services/config.js';
import {getPythonExecutableForYtDlp, getYtDlpVersion} from '../utils/yt-dlp.js';
import {ytDlpUpdateHours} from './settings.js';

export type YtDlpChannel = 'stable' | 'nightly';

export type YtDlpUpdateOutcome = {
  channel: YtDlpChannel;
  before: string | undefined;
  after: string | undefined;
};

// Saved in the data folder so the choice survives restarts and image updates.
const CHANNEL_FILE = path.join(DATA_DIR, 'livimuse-yt-dlp.json');
const PIP_TIMEOUT_MS = 5 * 60 * 1000;
const MANUAL_COOLDOWN_MS = 30 * 1000;

let channel: YtDlpChannel | undefined;
let running: Promise<YtDlpUpdateOutcome> | undefined;
let lastFinishedAt = 0;
let lastCheck: {at: Date; outcome?: YtDlpUpdateOutcome; error?: string} | undefined;
let started = false;

const log = (message: string) => {
  console.log(`[livimuse yt-dlp] ${message}`);
};

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

const installedVersion = async () => getYtDlpVersion().catch(() => undefined);

export const getYtDlpChannel = async (): Promise<YtDlpChannel> => {
  if (!channel) {
    try {
      const saved = JSON.parse(await fs.readFile(CHANNEL_FILE, 'utf8')) as {channel?: string};
      channel = saved.channel === 'nightly' ? 'nightly' : 'stable';
    } catch {
      channel = 'stable';
    }
  }

  return channel;
};

const saveChannel = async (next: YtDlpChannel) => {
  channel = next;
  await fs.mkdir(DATA_DIR, {recursive: true});
  await fs.writeFile(CHANNEL_FILE, JSON.stringify({channel: next}, null, 2));
};

const pip = async (python: string, args: string[]) => execa(python, ['-m', 'pip', ...args], {
  env: {PIP_DISABLE_PIP_VERSION_CHECK: '1', PIP_NO_INPUT: '1'},
  timeout: PIP_TIMEOUT_MS,
});

// Newest non-pre-release on PyPI, e.g. "2026.10.03".
const latestStableVersion = async (python: string) => {
  const {stdout} = await pip(python, ['index', 'versions', 'yt-dlp']);
  const version = /^yt-dlp \(([^)]+)\)/m.exec(stdout)?.[1];

  if (!version) {
    throw new Error('couldn\'t find the latest stable yt-dlp version on PyPI');
  }

  return version;
};

const install = async (target: YtDlpChannel): Promise<YtDlpUpdateOutcome> => {
  const python = await getPythonExecutableForYtDlp();

  if (!python) {
    throw new Error('yt-dlp wasn\'t installed with pip here, so it can\'t be updated from Discord');
  }

  const before = await installedVersion();

  if (target === 'nightly') {
    await pip(python, ['install', '--upgrade', '--pre', 'yt-dlp[default]']);
  } else {
    // An exact version, so this also moves back down from a nightly build.
    await pip(python, ['install', `yt-dlp[default]==${await latestStableVersion(python)}`]);
  }

  return {channel: target, before, after: await installedVersion()};
};

// One update at a time; manual requests also wait out a short cooldown.
const runUpdate = async (target: YtDlpChannel, reason: string, manual: boolean): Promise<YtDlpUpdateOutcome> => {
  if (running) {
    throw new Error('yt-dlp is already updating, try again in a moment');
  }

  if (manual && Date.now() - lastFinishedAt < MANUAL_COOLDOWN_MS) {
    throw new Error('yt-dlp was just updated, try again in a few seconds');
  }

  running = install(target);

  try {
    const outcome = await running;
    lastCheck = {at: new Date(), outcome};
    log(outcome.before === outcome.after
      ? `${reason}: already current on ${target} (${outcome.after ?? 'unknown'})`
      : `${reason}: updated ${outcome.before ?? 'unknown'} -> ${outcome.after ?? 'unknown'} (${target})`);
    return outcome;
  } catch (error: unknown) {
    lastCheck = {at: new Date(), error: errorText(error)};
    console.warn(`[livimuse yt-dlp] ${reason}: update failed on ${target}: ${errorText(error)}`);
    throw error;
  } finally {
    running = undefined;
    lastFinishedAt = Date.now();
  }
};

export const updateYtDlpNow = async (): Promise<YtDlpUpdateOutcome> => runUpdate(await getYtDlpChannel(), '/ytdlp update', true);

export const switchYtDlpChannel = async (next: YtDlpChannel): Promise<YtDlpUpdateOutcome> => {
  const outcome = await runUpdate(next, `/ytdlp ${next}`, true);
  // Only remember the choice once the install worked.
  await saveChannel(next);
  return outcome;
};

export const ytDlpStatus = async () => ({
  version: await installedVersion(),
  channel: await getYtDlpChannel(),
  lastCheck,
});

export const startYtDlpUpdates = (): void => {
  if (started) {
    return;
  }

  started = true;

  void (async () => {
    // Muse's startup update only knows stable, and a recreated container starts
    // from the image's stable build, so put nightly back if that was chosen.
    if (await getYtDlpChannel() === 'nightly') {
      await runUpdate('nightly', 'startup', false).catch(() => undefined);
    }
  })();

  const hours = ytDlpUpdateHours();

  if (process.env.YT_DLP_AUTO_UPDATE !== 'true' || hours === 0) {
    return;
  }

  log(`checking for updates every ${hours}h`);

  setInterval(() => {
    void (async () => {
      await runUpdate(await getYtDlpChannel(), 'daily check', false).catch(() => undefined);
    })();
  }, hours * 60 * 60 * 1000).unref();
};
