import {describe, expect, it} from 'vitest';
import {messages as appMessages} from '../src/custom/messages.js';
import {messages as originalMessages} from './livimuse-original-messages.js';

describe('LiviMuse messages alias', () => {
  it('runs tests against the frozen original wording', () => {
    expect(appMessages).toBe(originalMessages);
  });
});
