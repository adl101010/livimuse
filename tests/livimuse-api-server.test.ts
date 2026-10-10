import http from 'node:http';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

// The paths end in .ts on purpose: vitest.config.ts aliases custom/controls.js
// imports to a stub, and these mocks need to hit the real files server.ts uses.
vi.mock('../src/custom/controls.ts', () => ({
  buildCard: vi.fn(),
  clearLastAction: vi.fn(),
  liveCardChannelId: vi.fn(),
  retireCard: vi.fn(),
  setLastAction: vi.fn(),
  trackCard: vi.fn(),
}));
vi.mock('../src/custom/voice-status.ts', () => ({clearVoiceStatus: vi.fn()}));

import ApiServer from '../src/custom/api/server.js';

const ENV_KEYS = ['LIVIMUSE_API_TOKEN', 'LIVIMUSE_API_PORT', 'LIVIMUSE_API_BIND'] as const;

const makeServer = () => new ApiServer({} as never, {get: vi.fn()} as never, {addToQueue: vi.fn()} as never);

let listen: ReturnType<typeof vi.fn>;
let createServer: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }

  listen = vi.fn((_port: number, _bind: string, callback: () => void) => {
    callback();
  });
  createServer = vi.spyOn(http, 'createServer').mockReturnValue({close: vi.fn(), listen, on: vi.fn()} as never);
  vi.spyOn(process, 'once').mockImplementation(() => process);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }

  vi.restoreAllMocks();
});

describe('ApiServer', () => {
  it('does not listen at all when LIVIMUSE_API_TOKEN is unset', () => {
    makeServer().start();

    expect(createServer).not.toHaveBeenCalled();
    expect(listen).not.toHaveBeenCalled();
  });

  it('does not listen when the token is empty or only whitespace', () => {
    process.env.LIVIMUSE_API_TOKEN = '   ';

    makeServer().start();

    expect(createServer).not.toHaveBeenCalled();
  });

  it('listens on 8787 and all interfaces by default once a token is set', () => {
    process.env.LIVIMUSE_API_TOKEN = 'a-long-enough-token-1234';

    makeServer().start();

    expect(createServer).toHaveBeenCalledOnce();
    expect(listen).toHaveBeenCalledWith(8787, '0.0.0.0', expect.any(Function));
  });

  it('honours LIVIMUSE_API_PORT and LIVIMUSE_API_BIND, and falls back when they are empty or invalid', () => {
    process.env.LIVIMUSE_API_TOKEN = 'a-long-enough-token-1234';
    process.env.LIVIMUSE_API_PORT = '9100';
    process.env.LIVIMUSE_API_BIND = '127.0.0.1';
    makeServer().start();
    expect(listen).toHaveBeenLastCalledWith(9100, '127.0.0.1', expect.any(Function));

    process.env.LIVIMUSE_API_PORT = 'not-a-port';
    process.env.LIVIMUSE_API_BIND = '';
    makeServer().start();
    expect(listen).toHaveBeenLastCalledWith(8787, '0.0.0.0', expect.any(Function));
  });

  it('only starts one server per instance', () => {
    process.env.LIVIMUSE_API_TOKEN = 'a-long-enough-token-1234';
    const server = makeServer();

    server.start();
    server.start();

    expect(createServer).toHaveBeenCalledOnce();
  });

  it('closes on SIGTERM', () => {
    process.env.LIVIMUSE_API_TOKEN = 'a-long-enough-token-1234';

    makeServer().start();

    expect(process.once).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
  });
});
