// LiviMuse: keep yt-dlp current while the bot runs. Muse only updates it at
// startup (YT_DLP_AUTO_UPDATE=true); this repeats that update on a timer. yt-dlp
// runs fresh for each song, so a new version applies from the next song on.
import {updateYtDlp} from '../utils/yt-dlp.js';
import {ytDlpUpdateHours} from './settings.js';

let started = false;

const runUpdate = async () => {
  const result = await updateYtDlp();

  if (result.updated && result.beforeVersion) {
    console.log(`[livimuse yt-dlp] updated ${result.beforeVersion} -> ${result.afterVersion ?? 'unknown'}`);
  } else if (result.updateSucceeded) {
    console.log(`[livimuse yt-dlp] already current (${result.afterVersion ?? 'unknown'})`);
  } else {
    console.warn(`[livimuse yt-dlp] update failed, keeping ${result.afterVersion ?? 'current version'}: ${result.error ?? 'unknown error'}`);
  }
};

export const startYtDlpUpdates = (): void => {
  const hours = ytDlpUpdateHours();

  if (started || process.env.YT_DLP_AUTO_UPDATE !== 'true' || hours === 0) {
    return;
  }

  started = true;
  console.log(`[livimuse yt-dlp] checking for updates every ${hours}h`);

  setInterval(() => {
    runUpdate().catch((error: unknown) => {
      console.warn(`[livimuse yt-dlp] update check crashed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }, hours * 60 * 60 * 1000).unref();
};
