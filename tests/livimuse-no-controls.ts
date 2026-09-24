// LiviMuse: stand-in for src/custom/controls.ts during tests (see
// vitest.config.ts), so Muse's tests see cards exactly as upstream sends them.
export const withControls = () => ({});
export const trackCard = () => undefined;
export const forgetCard = () => undefined;
