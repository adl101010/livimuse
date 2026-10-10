import http from 'node:http';
import type {AddressInfo} from 'node:net';
import {ChannelType} from 'discord.js';
import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';
import {createApiHandler, MAX_BODY_BYTES, type ApiDeps} from '../src/custom/api/handler.js';
import {MediaSource, STATUS} from '../src/services/player-types.js';

const TOKEN = 'test-token-0123456789abcdef';
const USER = '111111111111111111';
const OTHER_USER = '222222222222222222';
const GUILD_A = '333333333333333333';
const GUILD_B = '444444444444444444';
const VC_A = '555555555555555551';
const VC_B = '555555555555555552';
const TEXT_A = '666666666666666661';

type FakeSong = ReturnType<typeof makeSong>;

const makeSong = (title: string, requestedBy = USER) => ({
  addedInChannelId: TEXT_A,
  artist: 'Artist',
  isLive: false,
  length: 200,
  offset: 0,
  playlist: null,
  requestedBy,
  source: MediaSource.Youtube,
  thumbnailUrl: null,
  title,
  url: 'dQw4w9WgXcQ',
});

// ---- fakes ---------------------------------------------------------------

const makeGuild = (id: string, name: string, voice: Record<string, string> = {}) => {
  const channels = new Map<string, unknown>();
  const guild = {
    channels: {cache: channels},
    id,
    name,
    voiceStates: {cache: new Map(Object.entries(voice).map(([userId, channelId]) => [userId, {channelId}]))},
  };

  return guild;
};

const makeVoiceChannel = (id: string, guild: ReturnType<typeof makeGuild>) => {
  const channel = {guild, id, isVoiceBased: () => true, isTextBased: () => false, name: `voice-${id}`, type: ChannelType.GuildVoice};
  guild.channels.cache.set(id, channel);

  return channel;
};

const makeTextChannel = (id: string, guild: ReturnType<typeof makeGuild>) => {
  const channel = {guild, id, isVoiceBased: () => false, isTextBased: () => true, name: `text-${id}`, send: vi.fn().mockResolvedValue({id: 'card'}), type: ChannelType.GuildText};
  guild.channels.cache.set(id, channel);

  return channel;
};

const makePlayer = () => {
  const state = {current: null as FakeSong | null, queue: [] as FakeSong[]};
  const player = {
    canGoForward: vi.fn(() => state.queue.length > 0),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    forward: vi.fn().mockResolvedValue(undefined),
    getCurrent: vi.fn(() => state.current),
    getPosition: vi.fn(() => 12),
    getQueue: vi.fn(() => state.queue),
    getVolume: vi.fn(() => 40),
    loopCurrentQueue: false,
    loopCurrentSong: false,
    pause: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    setVolume: vi.fn(),
    state,
    status: STATUS.IDLE as STATUS,
    stop: vi.fn(),
    voiceConnection: null as {joinConfig: {channelId: string}} | null,
  };

  return player;
};

type FakePlayer = ReturnType<typeof makePlayer>;

interface World {
  deps: ApiDeps;
  guildA: ReturnType<typeof makeGuild>;
  guildB: ReturnType<typeof makeGuild>;
  logs: string[];
  players: Map<string, FakePlayer>;
  ready: {value: boolean};
  textA: ReturnType<typeof makeTextChannel>;
  addToQueue: ReturnType<typeof vi.fn>;
  cards: {
    liveCardChannelId: ReturnType<typeof vi.fn>;
    onStopped: ReturnType<typeof vi.fn>;
    postCard: ReturnType<typeof vi.fn>;
    setLastAction: ReturnType<typeof vi.fn>;
  };
}

const makeWorld = (voice: {a?: Record<string, string>; b?: Record<string, string>} = {}): World => {
  const guildA = makeGuild(GUILD_A, 'Guild A', voice.a ?? {[USER]: VC_A});
  const guildB = makeGuild(GUILD_B, 'Guild B', voice.b ?? {});
  makeVoiceChannel(VC_A, guildA);
  makeVoiceChannel(VC_B, guildB);
  const textA = makeTextChannel(TEXT_A, guildA);
  const ready = {value: true};
  const players = new Map<string, FakePlayer>([[GUILD_A, makePlayer()], [GUILD_B, makePlayer()]]);
  const logs: string[] = [];

  const channelsCache = new Map<string, unknown>([
    [VC_A, guildA.channels.cache.get(VC_A)],
    [VC_B, guildB.channels.cache.get(VC_B)],
    [TEXT_A, textA],
  ]);
  const client = {
    channels: {cache: channelsCache},
    guilds: {cache: new Map([[GUILD_A, guildA], [GUILD_B, guildB]])},
    isReady: () => ready.value,
  };

  const addToQueue = vi.fn(async (options: {interaction: {member: {voice: {channel: {id: string}}}}; query: string}) => {
    const player = players.get(options.interaction.member.voice.channel.id === VC_A ? GUILD_A : GUILD_B)!;
    const song = makeSong(options.query);

    if (!player.state.current) {
      player.state.current = song;
      player.status = STATUS.PLAYING;
    } else {
      player.state.queue.push(song);
    }

    // The real service reports through editReply; mimic its confirmation.
    await (options.interaction as unknown as {editReply: (text: string) => Promise<void>}).editReply(`**${song.title}** added to the queue`);
  });

  const cards = {
    liveCardChannelId: vi.fn(() => undefined as string | undefined),
    onStopped: vi.fn().mockResolvedValue(undefined),
    postCard: vi.fn().mockResolvedValue(undefined),
    setLastAction: vi.fn(),
  };

  const deps: ApiDeps = {
    addToQueue: addToQueue as never,
    cards,
    client: client as never,
    getMostPopularVoiceChannel: guild => (guild.id === GUILD_A ? guildA.channels.cache.get(VC_A) as never : null),
    getPlayer: guildId => players.get(guildId) as never,
    log: line => logs.push(line),
    token: TOKEN,
  };

  return {addToQueue, cards, deps, guildA, guildB, logs, players, ready, textA};
};

// ---- harness -------------------------------------------------------------

let server: http.Server;
let baseUrl = '';
let world: World;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    void createApiHandler(world.deps)(req, res);
  });
  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise(resolve => {
    server.close(resolve);
  });
});

beforeEach(() => {
  world = makeWorld();
});

const call = async (method: string, path: string, options: {body?: unknown; token?: string | null; headers?: Record<string, string>; raw?: string} = {}) => {
  const headers: Record<string, string> = {...options.headers};

  if (options.token !== null) {
    headers.Authorization = `Bearer ${options.token ?? TOKEN}`;
  }

  let body: string | undefined;

  if (options.raw !== undefined) {
    body = options.raw;
  } else if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    headers['Content-Type'] ??= 'application/json';
  }

  const response = await fetch(`${baseUrl}${path}`, {body, headers, method});
  const text = await response.text();

  return {body: text ? JSON.parse(text) as Record<string, any> : {}, headers: response.headers, status: response.status};
};

// ---- tests ---------------------------------------------------------------

describe('health and authentication', () => {
  it('answers /api/health without a token and reports readiness', async () => {
    const ready = await call('GET', '/api/health', {token: null});
    expect(ready.status).toBe(200);
    expect(ready.body).toEqual({ok: true, ready: true});

    world.ready.value = false;
    const notReady = await call('GET', '/api/health', {token: null});
    expect(notReady.status).toBe(200);
    expect(notReady.body).toEqual({ok: true, ready: false});
  });

  it('requires a bearer token on every other route', async () => {
    const routes: Array<[string, string]> = [
      ['GET', `/api/guilds/${GUILD_A}/status`],
      ['GET', `/api/users/${USER}/voice`],
      ['POST', '/api/play'],
      ['POST', `/api/guilds/${GUILD_A}/skip`],
      ['GET', '/api/unknown'],
    ];

    for (const [method, path] of routes) {
      // eslint-disable-next-line no-await-in-loop
      const response = await call(method, path, {token: null});
      expect(response.status, `${method} ${path}`).toBe(401);
      expect(response.body.error).toBe('unauthorized');
    }
  });

  it('rejects a wrong token, including one of a different length', async () => {
    const wrong = await call('GET', `/api/guilds/${GUILD_A}/status`, {token: 'wrong-token'});
    const prefix = await call('GET', `/api/guilds/${GUILD_A}/status`, {token: TOKEN.slice(0, -1)});
    const longer = await call('GET', `/api/guilds/${GUILD_A}/status`, {token: `${TOKEN}x`});

    expect(wrong.status).toBe(401);
    expect(prefix.status).toBe(401);
    expect(longer.status).toBe(401);
  });

  it('rejects a non-bearer scheme', async () => {
    const response = await call('GET', `/api/guilds/${GUILD_A}/status`, {headers: {Authorization: `Basic ${TOKEN}`}, token: null});

    expect(response.status).toBe(401);
  });

  it('accepts the right token and adds no CORS or HTML', async () => {
    const response = await call('GET', `/api/guilds/${GUILD_A}/status`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('answers 503 for real routes until the client is ready', async () => {
    world.ready.value = false;

    const response = await call('GET', `/api/guilds/${GUILD_A}/status`);

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('not_ready');
  });

  it('never writes the token to the log', async () => {
    await call('GET', `/api/guilds/${GUILD_A}/status`);
    await call('GET', `/api/guilds/${GUILD_A}/status`, {token: 'wrong-token'});

    expect(world.logs.length).toBeGreaterThanOrEqual(2);
    expect(world.logs.join('\n')).not.toContain(TOKEN);
    expect(world.logs.join('\n')).not.toContain('wrong-token');
  });
});

describe('request validation', () => {
  it('returns 404 for unknown routes and 405 for the wrong method', async () => {
    expect((await call('GET', '/api/nope')).status).toBe(404);
    expect((await call('GET', '/api/play')).status).toBe(405);
    expect((await call('POST', `/api/guilds/${GUILD_A}/status`)).status).toBe(405);
  });

  it('rejects a body that is not JSON', async () => {
    const wrongType = await call('POST', '/api/play', {headers: {'Content-Type': 'text/plain'}, raw: 'hello'});
    const json = {'Content-Type': 'application/json'};
    const badJson = await call('POST', '/api/play', {headers: json, raw: '{nope'});
    const notObject = await call('POST', '/api/play', {headers: json, raw: '[1,2]'});

    expect(wrongType.status).toBe(415);
    expect(badJson.status).toBe(400);
    expect(badJson.body.error).toBe('invalid_json');
    expect(notObject.status).toBe(400);
  });

  it('limits the body to 16 KB', async () => {
    const response = await call('POST', '/api/play', {body: {query: 'x'.repeat(MAX_BODY_BYTES + 100), userId: USER}});

    expect(response.status).toBe(413);
    expect(world.addToQueue).not.toHaveBeenCalled();
  });

  it('answers with the documented error shape', async () => {
    const response = await call('POST', '/api/play', {body: {userId: USER}});

    expect(response.status).toBe(400);
    expect(Object.keys(response.body).sort()).toEqual(['error', 'message']);
  });
});

describe('GET /api/users/:userId/voice', () => {
  it('returns the guild and voice channel the user is in', async () => {
    const response = await call('GET', `/api/users/${USER}/voice`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({guildId: GUILD_A, guildName: 'Guild A', voiceChannelId: VC_A});
  });

  it('returns 404 when the user is not in voice', async () => {
    const response = await call('GET', `/api/users/${OTHER_USER}/voice`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('user_not_in_voice');
  });

  it('lists every match when the user is in voice in several servers', async () => {
    world = makeWorld({a: {[USER]: VC_A}, b: {[USER]: VC_B}});

    const response = await call('GET', `/api/users/${USER}/voice`);

    expect(response.status).toBe(200);
    expect(response.body.matches).toHaveLength(2);
  });
});

describe('GET /api/guilds/:guildId/status', () => {
  it('reports what is playing, loop state, volume, and the first 25 queued songs', async () => {
    const player = world.players.get(GUILD_A)!;
    player.state.current = makeSong('Now');
    player.state.queue = Array.from({length: 30}, (_, index) => makeSong(`Song ${index}`));
    player.status = STATUS.PAUSED;
    player.voiceConnection = {joinConfig: {channelId: VC_A}};
    player.loopCurrentSong = true;

    const response = await call('GET', `/api/guilds/${GUILD_A}/status`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      connected: true,
      loop: {queue: false, song: true},
      nowPlaying: {durationSeconds: 200, positionSeconds: 12, requestedBy: USER, title: 'Now', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'},
      paused: true,
      status: 'paused',
      voiceChannel: {id: VC_A},
      volume: 40,
    });
    expect(response.body.queue.total).toBe(30);
    expect(response.body.queue.items).toHaveLength(25);
  });

  it('returns 404 for a server the bot is not in', async () => {
    const response = await call('GET', '/api/guilds/999999999999999999/status');

    expect(response.status).toBe(404);
  });
});

describe('POST /api/play', () => {
  it('plays into the voice channel the user is in, attributed to them, via the /play code path', async () => {
    const response = await call('POST', '/api/play', {body: {query: 'daft punk one more time', userId: USER}});

    expect(response.status).toBe(200);
    expect(world.addToQueue).toHaveBeenCalledOnce();

    const options = world.addToQueue.mock.calls[0][0] as {
      addToFrontOfQueue: boolean;
      interaction: {channel: {id: string}; guild: {id: string}; member: {user: {id: string}; voice: {channel: {id: string}}}};
      query: string;
      shuffleAdditions: boolean;
    };
    expect(options.query).toBe('daft punk one more time');
    expect(options.addToFrontOfQueue).toBe(false);
    expect(options.shuffleAdditions).toBe(false);
    expect(options.interaction.guild.id).toBe(GUILD_A);
    expect(options.interaction.member.user.id).toBe(USER);
    expect(options.interaction.member.voice.channel.id).toBe(VC_A);

    expect(response.body).toMatchObject({
      count: 1,
      guildId: GUILD_A,
      message: '**daft punk one more time** added to the queue',
      queued: [{position: 0, requestedBy: USER, title: 'daft punk one more time'}],
      voiceChannelId: VC_A,
    });
    expect(response.body.status.nowPlaying.title).toBe('daft punk one more time');
  });

  it('reports the queue position of what was added', async () => {
    const player = world.players.get(GUILD_A)!;
    player.state.current = makeSong('Already playing');
    player.status = STATUS.PLAYING;

    const response = await call('POST', '/api/play', {body: {query: 'second', userId: USER}});

    expect(response.body.queued).toMatchObject([{position: 1, title: 'second'}]);
  });

  it('passes next and shuffle through', async () => {
    await call('POST', '/api/play', {body: {next: true, query: 'a', shuffle: true, userId: USER}});

    expect(world.addToQueue).toHaveBeenCalledWith(expect.objectContaining({addToFrontOfQueue: true, shuffleAdditions: true}));
  });

  it('uses an explicit voiceChannelId even when the user is not in voice', async () => {
    const response = await call('POST', '/api/play', {body: {query: 'x', userId: OTHER_USER, voiceChannelId: VC_B}});

    expect(response.status).toBe(200);
    expect(response.body.guildId).toBe(GUILD_B);
    expect(response.body.voiceChannelId).toBe(VC_B);
  });

  it('returns 409 when the user is not in voice and none was given', async () => {
    const response = await call('POST', '/api/play', {body: {query: 'x', userId: OTHER_USER}});

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('user_not_in_voice');
    expect(world.addToQueue).not.toHaveBeenCalled();
  });

  it('returns 409 when the user is in voice in several servers and no guildId was given', async () => {
    world = makeWorld({a: {[USER]: VC_A}, b: {[USER]: VC_B}});

    const ambiguous = await call('POST', '/api/play', {body: {query: 'x', userId: USER}});
    expect(ambiguous.status).toBe(409);
    expect(ambiguous.body.error).toBe('ambiguous_guild');
    expect(ambiguous.body.matches).toHaveLength(2);

    const resolved = await call('POST', '/api/play', {body: {guildId: GUILD_B, query: 'x', userId: USER}});
    expect(resolved.status).toBe(200);
    expect(resolved.body.guildId).toBe(GUILD_B);
  });

  it('rejects a voiceChannelId from a different server than guildId', async () => {
    const response = await call('POST', '/api/play', {body: {guildId: GUILD_A, query: 'x', userId: USER, voiceChannelId: VC_B}});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('channel_guild_mismatch');
  });

  it('requires a query and a user', async () => {
    expect((await call('POST', '/api/play', {body: {query: '   ', userId: USER}})).status).toBe(400);
    expect((await call('POST', '/api/play', {body: {query: 'x'}})).status).toBe(400);
    expect((await call('POST', '/api/play', {body: {query: 'x', userId: 'not-a-snowflake'}})).status).toBe(400);
  });

  it('runs silently without a textChannelId', async () => {
    await call('POST', '/api/play', {body: {query: 'x', userId: USER}});

    expect(world.cards.postCard).not.toHaveBeenCalled();
    expect(world.textA.send).not.toHaveBeenCalled();
  });

  it('posts the now-playing card to the text channel when asked and none is live there', async () => {
    const response = await call('POST', '/api/play', {body: {query: 'x', textChannelId: TEXT_A, userId: USER}});

    expect(response.status).toBe(200);
    expect(world.cards.postCard).toHaveBeenCalledWith(world.textA, expect.anything());
  });

  it('does not post a second card when one is already live in that channel', async () => {
    world.cards.liveCardChannelId.mockReturnValue(TEXT_A);

    await call('POST', '/api/play', {body: {query: 'x', textChannelId: TEXT_A, userId: USER}});

    expect(world.cards.postCard).not.toHaveBeenCalled();
  });

  it('rejects a text channel from another server', async () => {
    const other = makeTextChannel('777777777777777771', world.guildB);
    (world.deps.client.channels.cache as unknown as Map<string, unknown>).set(other.id, other);

    const response = await call('POST', '/api/play', {body: {query: 'x', textChannelId: other.id, userId: USER, voiceChannelId: VC_A}});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_text_channel');
  });

  it('maps a search with no results to 404', async () => {
    world.addToQueue.mockRejectedValueOnce(new Error('no songs found'));

    const response = await call('POST', '/api/play', {body: {query: 'zzzz', userId: USER}});

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('no_results');
  });

  it('maps unexpected failures to 500 without leaking a stack', async () => {
    world.addToQueue.mockRejectedValueOnce(new Error('ffmpeg exploded'));

    const response = await call('POST', '/api/play', {body: {query: 'x', userId: USER}});

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('play_failed');
    expect(JSON.stringify(response.body)).not.toContain('at ');
  });
});

describe('playback controls', () => {
  const playing = () => {
    const player = world.players.get(GUILD_A)!;
    player.state.current = makeSong('Now');
    player.state.queue = [makeSong('Next')];
    player.status = STATUS.PLAYING;
    player.voiceConnection = {joinConfig: {channelId: VC_A}};

    return player;
  };

  it('pauses, and credits the user on the card', async () => {
    const player = playing();

    const response = await call('POST', `/api/guilds/${GUILD_A}/pause`, {body: {userId: USER}});

    expect(response.status).toBe(200);
    expect(player.pause).toHaveBeenCalledOnce();
    expect(world.cards.setLastAction).toHaveBeenCalledWith(GUILD_A, expect.anything(), USER);
  });

  it('works without a body or userId', async () => {
    const player = playing();

    const response = await call('POST', `/api/guilds/${GUILD_A}/pause`);

    expect(response.status).toBe(200);
    expect(player.pause).toHaveBeenCalledOnce();
    expect(world.cards.setLastAction).not.toHaveBeenCalled();
  });

  it('refuses to pause when nothing is playing', async () => {
    const response = await call('POST', `/api/guilds/${GUILD_A}/pause`);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('not_playing');
  });

  it('resumes into the user\'s voice channel when the bot is not connected', async () => {
    const player = world.players.get(GUILD_A)!;
    player.state.current = makeSong('Paused song');
    player.status = STATUS.PAUSED;

    const response = await call('POST', `/api/guilds/${GUILD_A}/resume`, {body: {userId: USER}});

    expect(response.status).toBe(200);
    expect(player.connect).toHaveBeenCalledWith(expect.objectContaining({id: VC_A}));
    expect(player.play).toHaveBeenCalledOnce();
  });

  it('skips to the next song', async () => {
    const player = playing();

    const response = await call('POST', `/api/guilds/${GUILD_A}/skip`);

    expect(response.status).toBe(200);
    expect(player.forward).toHaveBeenCalledWith(1);
  });

  it('returns 409 when there is nothing to skip to', async () => {
    const player = playing();
    player.state.queue = [];

    const response = await call('POST', `/api/guilds/${GUILD_A}/skip`);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('no_next_song');
    expect(player.forward).not.toHaveBeenCalled();
  });

  it('stops: clears the card and voice status, then stops the player', async () => {
    const player = playing();

    const response = await call('POST', `/api/guilds/${GUILD_A}/stop`);

    expect(response.status).toBe(200);
    expect(world.cards.onStopped).toHaveBeenCalledWith(GUILD_A);
    expect(player.stop).toHaveBeenCalledOnce();
  });

  it('returns 409 when stopping while not connected', async () => {
    const response = await call('POST', `/api/guilds/${GUILD_A}/stop`);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('not_connected');
  });

  it('disconnects', async () => {
    const player = playing();

    const response = await call('POST', `/api/guilds/${GUILD_A}/disconnect`);

    expect(response.status).toBe(200);
    expect(player.disconnect).toHaveBeenCalledOnce();
  });

  it('sets the volume, validating the range', async () => {
    const player = playing();

    const ok = await call('POST', `/api/guilds/${GUILD_A}/volume`, {body: {value: 25.4}});
    expect(ok.status).toBe(200);
    expect(player.setVolume).toHaveBeenCalledWith(25);

    for (const value of [-1, 101, 'loud', null, undefined]) {
      // eslint-disable-next-line no-await-in-loop
      const bad = await call('POST', `/api/guilds/${GUILD_A}/volume`, {body: {value}});
      expect(bad.status, String(value)).toBe(400);
    }

    expect(player.setVolume).toHaveBeenCalledOnce();
  });

  it('returns 404 for a server the bot is not in', async () => {
    const response = await call('POST', '/api/guilds/999999999999999999/skip');

    expect(response.status).toBe(404);
  });
});
