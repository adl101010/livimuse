import {describe, expect, it} from 'vitest';
// .ts on purpose: vitest.config.ts aliases custom/controls.js imports to a stub.
import {canonicalControlId, CONTROL_PREFIX, controlIds, legacyControlIds} from '../src/custom/controls.ts';

describe('component ids', () => {
  it('prefixes every id with muse:, so other programs sharing the token can be told apart', () => {
    expect(CONTROL_PREFIX).toBe('muse:');

    for (const id of Object.values(controlIds)) {
      expect(id.startsWith('muse:'), id).toBe(true);
    }
  });

  it('still recognises ids from cards posted before the prefix changed', () => {
    expect(legacyControlIds).toHaveLength(Object.values(controlIds).length);

    for (const id of legacyControlIds) {
      expect(id.startsWith('livimuse:'), id).toBe(true);
    }

    expect(canonicalControlId('livimuse:skip')).toBe(controlIds.skip);
    expect(canonicalControlId('livimuse:play-pause')).toBe(controlIds.playPause);
  });

  it('leaves current and foreign ids alone', () => {
    expect(canonicalControlId(controlIds.skip)).toBe(controlIds.skip);
    expect(canonicalControlId('logs:next-page')).toBe('logs:next-page');
    expect([...Object.values(controlIds), ...legacyControlIds]).not.toContain('logs:next-page');
  });
});
