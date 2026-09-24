// LiviMuse: run Muse's tests against stock Muse behavior, so our custom wording
// and playback buttons never break the build.
import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^.*\/custom\/messages\.js$/,
        replacement: fileURLToPath(new URL('tests/livimuse-original-messages.ts', import.meta.url)),
      },
      {
        find: /^.*\/custom\/controls\.js$/,
        replacement: fileURLToPath(new URL('tests/livimuse-no-controls.ts', import.meta.url)),
      },
    ],
  },
});
