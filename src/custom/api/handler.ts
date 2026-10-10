// LiviMuse: HTTP control API request handling. A trusted local service (an AI
// agent gateway, for example) can't click buttons or run slash commands, because
// bots can't invoke other bots' interactions, so this exposes playback control
// over HTTP. Everything here is plain functions over injected dependencies so it
// can be tested without Discord; server.ts wires in the real client and player.
import {createHash, timingSafeEqual} from 'node:crypto';
import type {IncomingMessage, ServerResponse} from 'node:http';
import {ChannelType} from 'discord.js';
import type {ChatInputCommandInteraction, Client, Guild, VoiceChannel} from 'discord.js';
import getYouTubeID from 'get-youtube-id';
import type Player from '../../services/player.js';
import {MediaSource, STATUS} from '../../services/player-types.js';
import type {QueuedSong} from '../../services/player-types.js';
import {messages} from '../messages.js';
import {ApiInteraction, type SendableChannel} from './interaction.js';

export const MAX_BODY_BYTES = 16 * 1024;
const MAX_QUEUE_ITEMS = 25;
const MAX_QUERY_LENGTH = 500;
const SNOWFLAKE = /^\d{5,25}$/;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export interface ApiCards {
  // Credit a playback change to a user on the card's "Last" line.
  setLastAction: (guildId: string, action: string, userId: string) => void;
  liveCardChannelId: (guildId: string) => string | undefined;
  // Post a new now-playing card (with buttons) and make it the live one.
  postCard: (channel: SendableChannel, player: Player) => Promise<void>;
  // Playback was ended from the API: clear the voice status, card and last action.
  onStopped: (guildId: string) => Promise<void>;
}

export interface AddToQueueOptions {
  interaction: ChatInputCommandInteraction;
  query: string;
  addToFrontOfQueue: boolean;
  shuffleAdditions: boolean;
  shouldSplitChapters: boolean;
  skipCurrentTrack: boolean;
}

export interface ApiDeps {
  token: string;
  client: Client;
  getPlayer: (guildId: string) => Player;
  addToQueue: (options: AddToQueueOptions) => Promise<void>;
  getMostPopularVoiceChannel: (guild: Guild) => VoiceChannel | null;
  cards: ApiCards;
  log: (line: string) => void;
}

// ---- small helpers -------------------------------------------------------

const digest = (value: string) => createHash('sha256').update(value).digest();

const sendJson = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
  const payload = JSON.stringify(body);

  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload).toString(),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(payload);
};

const readJsonBody = async (req: IncomingMessage): Promise<Record<string, unknown>> => {
  const declared = Number(req.headers['content-length'] ?? 0);

  if (declared > MAX_BODY_BYTES) {
    throw new ApiError(413, 'body_too_large', `request body is limited to ${MAX_BODY_BYTES} bytes`);
  }

  const raw = await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;

      if (size > MAX_BODY_BYTES) {
        reject(new ApiError(413, 'body_too_large', `request body is limited to ${MAX_BODY_BYTES} bytes`));
        return;
      }

      chunks.push(chunk);
    });
    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });

  if (raw.trim() === '') {
    return {};
  }

  if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) {
    throw new ApiError(415, 'unsupported_media_type', 'send the body as application/json');
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiError(400, 'invalid_json', 'the request body is not valid JSON');
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ApiError(400, 'invalid_json', 'the request body must be a JSON object');
  }

  return parsed as Record<string, unknown>;
};

const optionalString = (body: Record<string, unknown>, key: string): string | undefined => {
  const value = body[key];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new ApiError(400, 'invalid_field', `${key} must be a string`);
  }

  return value;
};

const optionalSnowflake = (body: Record<string, unknown>, key: string): string | undefined => {
  const value = optionalString(body, key);

  if (value !== undefined && !SNOWFLAKE.test(value)) {
    throw new ApiError(400, 'invalid_field', `${key} must be a Discord ID`);
  }

  return value;
};

const optionalBoolean = (body: Record<string, unknown>, key: string): boolean => {
  const value = body[key];

  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value !== 'boolean') {
    throw new ApiError(400, 'invalid_field', `${key} must be true or false`);
  }

  return value;
};

const songUrl = (song: QueuedSong) => {
  if (song.source !== MediaSource.Youtube) {
    return song.url;
  }

  const id = song.url.length === 11 ? song.url : getYouTubeID(song.url) ?? song.url;

  return `https://www.youtube.com/watch?v=${id}`;
};

const describeSong = (song: QueuedSong) => ({
  title: song.title,
  artist: song.artist,
  url: songUrl(song),
  durationSeconds: song.length,
  isLive: song.isLive,
  requestedBy: song.requestedBy,
});

const statusName = (status: STATUS) => {
  if (status === STATUS.PLAYING) {
    return 'playing';
  }

  return status === STATUS.PAUSED ? 'paused' : 'idle';
};

const voiceChannelOf = (guild: Guild, player: Player) => {
  const channelId = player.voiceConnection?.joinConfig.channelId;
  const channel = channelId ? guild.channels.cache.get(channelId) : undefined;

  return channelId ? {id: channelId, name: channel?.name ?? null} : null;
};

export const describeStatus = (guild: Guild, player: Player) => {
  const current = player.getCurrent();
  const queue = player.getQueue();

  return {
    guildId: guild.id,
    connected: player.voiceConnection !== null,
    voiceChannel: voiceChannelOf(guild, player),
    status: statusName(player.status),
    paused: current !== null && player.status === STATUS.PAUSED,
    nowPlaying: current
      ? {...describeSong(current), positionSeconds: player.getPosition(), thumbnailUrl: current.thumbnailUrl}
      : null,
    loop: {song: player.loopCurrentSong, queue: player.loopCurrentQueue},
    volume: player.getVolume(),
    queue: {
      total: queue.length,
      items: queue.slice(0, MAX_QUEUE_ITEMS).map(describeSong),
    },
  };
};

// ---- voice channel resolution -------------------------------------------

type VoiceMatch = {guild: Guild; channel: VoiceChannel};

const guildOrThrow = (client: Client, guildId: string): Guild => {
  const guild = client.guilds.cache.get(guildId);

  if (!guild) {
    throw new ApiError(404, 'guild_not_found', 'the bot is not in that server');
  }

  return guild;
};

const findUserVoice = (client: Client, userId: string, guildId?: string): VoiceMatch[] => {
  const guilds = guildId ? [guildOrThrow(client, guildId)] : [...client.guilds.cache.values()];
  const matches: VoiceMatch[] = [];

  for (const guild of guilds) {
    const channelId = guild.voiceStates.cache.get(userId)?.channelId;
    const channel = channelId ? guild.channels.cache.get(channelId) : undefined;

    if (channel?.type === ChannelType.GuildVoice) {
      matches.push({guild, channel});
    }
  }

  return matches;
};

const describeMatch = ({guild, channel}: VoiceMatch) => ({
  guildId: guild.id,
  guildName: guild.name,
  voiceChannelId: channel.id,
  voiceChannelName: channel.name,
});

const voiceChannelById = (client: Client, channelId: string, guildId?: string): VoiceMatch => {
  const channel = client.channels.cache.get(channelId);

  if (!channel || !('guild' in channel) || !channel.isVoiceBased()) {
    throw new ApiError(404, 'voice_channel_not_found', 'that voice channel was not found');
  }

  if (guildId && channel.guild.id !== guildId) {
    throw new ApiError(400, 'channel_guild_mismatch', 'that voice channel is not in the given server');
  }

  if (channel.type !== ChannelType.GuildVoice) {
    throw new ApiError(400, 'unsupported_channel', 'only regular voice channels are supported');
  }

  return {guild: channel.guild, channel};
};

// Use voiceChannelId if given; otherwise the voice channel the user is in.
const resolvePlayTarget = (client: Client, {userId, guildId, voiceChannelId}: {userId: string; guildId?: string; voiceChannelId?: string}): VoiceMatch => {
  if (voiceChannelId) {
    return voiceChannelById(client, voiceChannelId, guildId);
  }

  const matches = findUserVoice(client, userId, guildId);

  if (matches.length === 0) {
    throw new ApiError(409, 'user_not_in_voice', 'that user is not in a voice channel; pass voiceChannelId to pick one');
  }

  if (matches.length > 1) {
    throw new ApiError(409, 'ambiguous_guild', 'that user is in voice in more than one server; pass guildId', {
      matches: matches.map(describeMatch),
    });
  }

  return matches[0];
};

const resolveTextChannel = (client: Client, textChannelId: string, guild: Guild): SendableChannel => {
  const channel = client.channels.cache.get(textChannelId);

  if (!channel || !('guild' in channel) || channel.guild.id !== guild.id || !channel.isTextBased()) {
    throw new ApiError(400, 'invalid_text_channel', 'textChannelId must be a text channel in the same server');
  }

  return channel as unknown as SendableChannel;
};

// ---- routes --------------------------------------------------------------

type Context = {guildId?: string; userId?: string};

const queueEntries = (player: Player): QueuedSong[] => {
  const current = player.getCurrent();

  return current ? [current, ...player.getQueue()] : [...player.getQueue()];
};

const playErrorFor = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  if (/no (playable )?songs found|that doesn't exist/i.test(message)) {
    return new ApiError(404, 'no_results', message);
  }

  if (/spotify is not enabled/i.test(message)) {
    return new ApiError(400, 'spotify_disabled', message);
  }

  return new ApiError(500, 'play_failed', message.slice(0, 300));
};

const play = async (deps: ApiDeps, body: Record<string, unknown>, context: Context) => {
  const query = optionalString(body, 'query')?.trim() ?? '';

  if (query === '' || query.length > MAX_QUERY_LENGTH) {
    throw new ApiError(400, 'invalid_field', `query is required (up to ${MAX_QUERY_LENGTH} characters)`);
  }

  const userId = optionalSnowflake(body, 'userId');

  if (!userId) {
    throw new ApiError(400, 'invalid_field', 'userId is required');
  }

  const guildId = optionalSnowflake(body, 'guildId');
  const {guild, channel} = resolvePlayTarget(deps.client, {
    userId,
    guildId,
    voiceChannelId: optionalSnowflake(body, 'voiceChannelId'),
  });
  const textChannelId = optionalSnowflake(body, 'textChannelId');
  const textChannel = textChannelId ? resolveTextChannel(deps.client, textChannelId, guild) : undefined;

  context.guildId = guild.id;
  context.userId = userId;

  const player = deps.getPlayer(guild.id);
  const before = new Set(queueEntries(player));
  const interaction = new ApiInteraction({guild, voiceChannel: channel, textChannel, userId});

  try {
    await deps.addToQueue({
      interaction: interaction as unknown as ChatInputCommandInteraction,
      query,
      addToFrontOfQueue: optionalBoolean(body, 'next'),
      shuffleAdditions: optionalBoolean(body, 'shuffle'),
      shouldSplitChapters: false,
      skipCurrentTrack: false,
    });
  } catch (error: unknown) {
    throw playErrorFor(error);
  }

  // The service only posts a card when playback (re)started. If a text channel was
  // asked for and there's no live card there, post one.
  if (textChannel && !interaction.cardPosted && player.getCurrent() && deps.cards.liveCardChannelId(guild.id) !== textChannel.id) {
    await deps.cards.postCard(textChannel, player);
  }

  const queued = queueEntries(player)
    .map((song, position) => ({song, position}))
    .filter(({song}) => !before.has(song))
    .map(({song, position}) => ({...describeSong(song), position}));

  return {
    ok: true,
    guildId: guild.id,
    voiceChannelId: channel.id,
    queued,
    count: queued.length,
    message: interaction.lastText ?? null,
    status: describeStatus(guild, player),
  };
};

// What every control action gets to work with.
interface ControlRequest {
  deps: ApiDeps;
  guild: Guild;
  player: Player;
  body: Record<string, unknown>;
  userId?: string;
}

// Credit a change to the user on the card's "Last" line, when we know who asked.
const credit = ({deps, guild, userId}: ControlRequest, text: string) => {
  if (userId) {
    deps.cards.setLastAction(guild.id, text, userId);
  }
};

const resumeTarget = ({deps, guild, body, userId}: ControlRequest) => {
  const voiceChannelId = optionalSnowflake(body, 'voiceChannelId');

  if (voiceChannelId) {
    return voiceChannelById(deps.client, voiceChannelId, guild.id).channel;
  }

  const own = userId ? findUserVoice(deps.client, userId, guild.id)[0] : undefined;

  // Same fallback as /resume: the busiest voice channel.
  const channel = own?.channel ?? deps.getMostPopularVoiceChannel(guild);

  if (!channel) {
    throw new ApiError(409, 'no_voice_channel', 'no voice channel to join; pass voiceChannelId');
  }

  return channel;
};

// Each action mirrors the matching slash command, so the same preconditions apply.
const CONTROL_ACTIONS = new Map<string, (request: ControlRequest) => Promise<void> | void>([
  ['pause', request => {
    if (request.player.status !== STATUS.PLAYING) {
      throw new ApiError(409, 'not_playing', 'nothing is playing');
    }

    request.player.pause();
    credit(request, messages.actionPaused);
  }],
  ['resume', async request => {
    const {player} = request;

    if (player.status === STATUS.PLAYING) {
      throw new ApiError(409, 'already_playing', 'already playing');
    }

    if (!player.getCurrent()) {
      throw new ApiError(409, 'nothing_to_play', 'there is nothing queued to play');
    }

    if (!player.voiceConnection) {
      await player.connect(resumeTarget(request));
    }

    await player.play();

    if (!player.getCurrent()) {
      throw new ApiError(409, 'nothing_to_play', 'no playable songs found');
    }

    credit(request, messages.actionResumed);
  }],
  ['skip', async request => {
    const {player} = request;

    if (!player.getCurrent()) {
      throw new ApiError(409, 'nothing_playing', 'nothing is playing');
    }

    if (!player.canGoForward(1)) {
      throw new ApiError(409, 'no_next_song', 'there is no next song to skip to');
    }

    await player.forward(1);
    credit(request, messages.actionSkipped);
  }],
  ['stop', async request => {
    if (!request.player.voiceConnection) {
      throw new ApiError(409, 'not_connected', 'not connected to a voice channel');
    }

    await request.deps.cards.onStopped(request.guild.id);
    request.player.stop();
  }],
  ['disconnect', request => {
    if (!request.player.voiceConnection) {
      throw new ApiError(409, 'not_connected', 'not connected to a voice channel');
    }

    request.player.disconnect();
    credit(request, messages.actionDisconnected);
  }],
  ['volume', request => {
    const {player, body} = request;
    const {value} = body;

    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
      throw new ApiError(400, 'invalid_field', 'value must be a number from 0 to 100');
    }

    if (!player.getCurrent()) {
      throw new ApiError(409, 'nothing_playing', 'nothing is playing');
    }

    const previous = player.getVolume();
    const level = Math.round(value);

    player.setVolume(level);
    credit(request, level >= previous ? messages.actionVolumeUp(level) : messages.actionVolumeDown(level));
  }],
]);

const control = async (deps: ApiDeps, {guildId, action, body}: {guildId: string; action: string; body: Record<string, unknown>}, context: Context) => {
  const run = CONTROL_ACTIONS.get(action);

  if (!run) {
    throw new ApiError(404, 'not_found', 'unknown action');
  }

  const guild = guildOrThrow(deps.client, guildId);
  const userId = optionalSnowflake(body, 'userId');

  context.guildId = guildId;
  context.userId = userId;

  const player = deps.getPlayer(guildId);
  await run({deps, guild, player, body, userId});

  return {ok: true, action, status: describeStatus(guild, player)};
};

// ---- request handler -----------------------------------------------------

const route = (method: string, path: string) => {
  if (path === '/api/play') {
    return {name: 'play', allowed: 'POST', match: [] as string[], ok: method === 'POST'};
  }

  let match = /^\/api\/users\/([^/]+)\/voice$/.exec(path);

  if (match) {
    return {name: 'userVoice', allowed: 'GET', match: match.slice(1), ok: method === 'GET'};
  }

  match = /^\/api\/guilds\/([^/]+)\/status$/.exec(path);

  if (match) {
    return {name: 'status', allowed: 'GET', match: match.slice(1), ok: method === 'GET'};
  }

  match = /^\/api\/guilds\/([^/]+)\/([a-z]+)$/.exec(path);

  if (match && CONTROL_ACTIONS.has(match[2])) {
    return {name: 'action', allowed: 'POST', match: match.slice(1), ok: method === 'POST'};
  }

  return undefined;
};

const snowflakeFromPath = (value: string, what: string) => {
  let id = value;

  try {
    id = decodeURIComponent(value);
  } catch {
    // A malformed escape: leave it as is, so it fails the check below.
  }

  if (!SNOWFLAKE.test(id)) {
    throw new ApiError(400, 'invalid_field', `${what} must be a Discord ID`);
  }

  return id;
};

const userVoice = (deps: ApiDeps, rawUserId: string, context: Context) => {
  context.userId = rawUserId;
  const userId = snowflakeFromPath(rawUserId, 'user id');
  const matches = findUserVoice(deps.client, userId);

  if (matches.length === 0) {
    throw new ApiError(404, 'user_not_in_voice', 'that user is not in a voice channel');
  }

  context.guildId = matches[0].guild.id;

  return {...describeMatch(matches[0]), matches: matches.map(describeMatch)};
};

const guildStatus = (deps: ApiDeps, rawGuildId: string, context: Context) => {
  context.guildId = rawGuildId;
  const guildId = snowflakeFromPath(rawGuildId, 'guild id');

  return describeStatus(guildOrThrow(deps.client, guildId), deps.getPlayer(guildId));
};

const dispatch = async (deps: ApiDeps, req: IncomingMessage, matched: NonNullable<ReturnType<typeof route>>, context: Context) => {
  switch (matched.name) {
    case 'userVoice':
      return userVoice(deps, matched.match[0], context);
    case 'status':
      return guildStatus(deps, matched.match[0], context);
    case 'play':
      return play(deps, await readJsonBody(req), context);
    default: {
      const guildId = snowflakeFromPath(matched.match[0], 'guild id');
      context.guildId = guildId;

      return control(deps, {guildId, action: matched.match[1], body: await readJsonBody(req)}, context);
    }
  }
};

export const createApiHandler = (deps: ApiDeps) => {
  const expected = digest(deps.token);

  const authorized = (req: IncomingMessage) => {
    const header = req.headers.authorization ?? '';
    const match = /^Bearer\s+(\S+)\s*$/i.exec(header);

    // Compare fixed-size digests in constant time, so neither the value nor its length leaks.
    return match !== null && timingSafeEqual(digest(match[1]), expected);
  };

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const method = req.method ?? 'GET';
    const context: Context = {};
    let path = '/';
    let status = 500;
    let code = '';

    const respond = (httpStatus: number, body: unknown, headers: Record<string, string> = {}) => {
      status = httpStatus;
      sendJson(res, httpStatus, body, headers);
    };

    try {
      path = new URL(req.url ?? '/', 'http://localhost').pathname.replace(/\/+$/, '') || '/';

      if (path === '/api/health') {
        respond(200, {ok: true, ready: deps.client.isReady()});
        return;
      }

      // Everything else needs the token, including unknown paths (so they reveal nothing).
      if (!authorized(req)) {
        code = 'unauthorized';
        respond(401, {error: 'unauthorized', message: 'a valid bearer token is required'}, {'WWW-Authenticate': 'Bearer'});
        return;
      }

      const matched = route(method, path);

      if (!matched) {
        throw new ApiError(404, 'not_found', 'no such route');
      }

      if (!matched.ok) {
        throw new ApiError(405, 'method_not_allowed', `use ${matched.allowed} for this route`);
      }

      if (!deps.client.isReady()) {
        throw new ApiError(503, 'not_ready', 'the bot is still connecting to Discord');
      }

      respond(200, await dispatch(deps, req, matched, context));
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        code = error.code;
        respond(error.status, {error: error.code, message: error.message, ...error.details}, error.status === 413 ? {Connection: 'close'} : {});
      } else {
        code = 'internal_error';
        deps.log(`unexpected error on ${method} ${path}: ${error instanceof Error ? error.message : String(error)}`);
        respond(500, {error: 'internal_error', message: 'something went wrong'});
      }
    } finally {
      // Never log the token or request bodies.
      deps.log(`${method} ${path} guild=${context.guildId ?? '-'} user=${context.userId ?? '-'} -> ${status}${code ? ` ${code}` : ''}`);
    }
  };
};
