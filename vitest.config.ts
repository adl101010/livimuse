// LiviMuse: run Muse's tests against Muse's original reply wording, so changing
// src/custom/messages.ts never breaks the build.
import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^.*\/custom\/messages\.js$/,
        replacement: fileURLToPath(new URL('tests/livimuse-original-messages.ts', import.meta.url)),
      },
    ],
  },
});
