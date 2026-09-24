import {describe, expect, it} from 'vitest';
import {messages as appMessages} from '../src/custom/messages.js';
import {withControls as appWithControls} from '../src/custom/controls.js';
import {messages as originalMessages} from './livimuse-original-messages.js';
import {withControls as noControls} from './livimuse-no-controls.js';

describe('LiviMuse test aliases', () => {
  it('runs tests against the frozen original wording', () => {
    expect(appMessages).toBe(originalMessages);
  });

  it('runs tests without the playback buttons', () => {
    expect(appWithControls).toBe(noControls);
  });
});
