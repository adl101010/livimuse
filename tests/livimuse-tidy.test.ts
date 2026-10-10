import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest';

// tidy.ts only needs to know whether a message is a live card. The path ends in
// .ts on purpose: vitest.config.ts aliases any custom/controls.js import to a stub.
vi.mock('../src/custom/controls.ts', () => ({isLiveCard: () => false}));

import {
  installOwnershipTracking,
  isOwnMessage,
  recordRestResult,
  rememberOwnInteraction,
  rememberOwnMessage,
} from '../src/custom/ownership.js';
import {startTidying} from '../src/custom/tidy.js';

type Handler = (message: unknown) => void;

const BOT_ID = 'shared-bot-user';

const handlers = new Map<string, Handler>();
const client = {
  on: vi.fn((event: string, handler: Handler) => {
    handlers.set(event, handler);
    return client;
  }),
  rest: {request: vi.fn().mockResolvedValue({id: 'created-message'})},
  user: {id: BOT_ID},
};

const makeMessage = (id: string, overrides: Record<string, unknown> = {}) => {
  const message: Record<string, unknown> = {
    attachments: {size: 0},
    author: {id: BOT_ID},
    components: [],
    content: 'volume set to 30%',
    delete: vi.fn().mockResolvedValue(undefined),
    embeds: [],
    guildId: 'guild',
    id,
    interaction: null,
    mentions: {users: {size: 0}},
    ...overrides,
  };
  message.fetch = vi.fn().mockResolvedValue(message);

  return message as {delete: ReturnType<typeof vi.fn>; id: string};
};

const deliver = async (message: unknown) => {
  handlers.get('messageCreate')!(message);
  await vi.advanceTimersByTimeAsync(60_000);
};

beforeAll(() => {
  startTidying(client as never);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('message ownership', () => {
  it('records messages created through channel.send, followUp and editReply', () => {
    recordRestResult({fullRoute: '/channels/1/messages', method: 'POST'}, {id: 'sent'});
    recordRestResult({fullRoute: '/webhooks/2/tok/', method: 'POST'}, {id: 'ignored-trailing-slash'});
    recordRestResult({fullRoute: '/webhooks/2/tok', method: 'POST'}, {id: 'follow-up'});
    recordRestResult({fullRoute: '/webhooks/2/tok/messages/@original', method: 'PATCH'}, {id: 'edited'});

    expect(isOwnMessage({id: 'sent', interaction: null})).toBe(true);
    expect(isOwnMessage({id: 'follow-up', interaction: null})).toBe(true);
    expect(isOwnMessage({id: 'edited', interaction: null})).toBe(true);
    expect(isOwnMessage({id: 'ignored-trailing-slash', interaction: null})).toBe(false);
  });

  it('does not record reads or unrelated writes', () => {
    recordRestResult({fullRoute: '/channels/1/messages', method: 'GET'}, {id: 'read'});
    recordRestResult({fullRoute: '/channels/1/messages/5/reactions/x/@me', method: 'PUT'}, {id: 'reaction'});

    expect(isOwnMessage({id: 'read', interaction: null})).toBe(false);
    expect(isOwnMessage({id: 'reaction', interaction: null})).toBe(false);
  });

  it('treats a response to an interaction we answered as ours, and nobody else\'s', () => {
    recordRestResult({fullRoute: '/interactions/900/some-token/callback', method: 'POST'}, undefined);

    expect(isOwnMessage({id: 'reply', interaction: {id: '900'}} as never)).toBe(true);
    expect(isOwnMessage({id: 'other', interaction: {id: '901'}} as never)).toBe(false);
  });

  it('records messages by wrapping the REST client', async () => {
    installOwnershipTracking(client as never);

    const result = await (client.rest.request as unknown as (options: unknown) => Promise<unknown>)({
      fullRoute: '/channels/5/messages',
      method: 'POST',
    });

    expect(result).toEqual({id: 'created-message'});
    expect(isOwnMessage({id: 'created-message', interaction: null})).toBe(true);
  });
});

describe('tidy', () => {
  it('deletes a plain confirmation this process sent, after the delay', async () => {
    vi.useFakeTimers();
    const message = makeMessage('ours-plain');
    rememberOwnMessage('ours-plain');

    handlers.get('messageCreate')!(message);
    await vi.advanceTimersByTimeAsync(59_000);
    expect(message.delete).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(message.delete).toHaveBeenCalledOnce();
  });

  it('deletes a plain reply to an interaction this process answered', async () => {
    vi.useFakeTimers();
    const message = makeMessage('ours-reply', {interaction: {id: 'int-1'}});
    rememberOwnInteraction('int-1');

    await deliver(message);

    expect(message.delete).toHaveBeenCalledOnce();
  });

  it('does NOT delete plain messages that merely share the bot user (another program\'s)', async () => {
    vi.useFakeTimers();
    const hermes = makeMessage('hermes-reply');
    const logsReply = makeMessage('logs-reply', {interaction: {id: 'someone-elses-interaction'}});

    await deliver(hermes);
    await deliver(logsReply);

    expect(hermes.delete).not.toHaveBeenCalled();
    expect(logsReply.delete).not.toHaveBeenCalled();
  });

  it('keeps our cards, buttons, mentions and attachments', async () => {
    vi.useFakeTimers();
    const variants = [
      makeMessage('embed', {embeds: [{}]}),
      makeMessage('buttons', {components: [{}]}),
      makeMessage('mention', {mentions: {users: {size: 1}}}),
      makeMessage('file', {attachments: {size: 1}}),
      makeMessage('empty', {content: '   '}),
    ];

    for (const message of variants) {
      rememberOwnMessage(message.id);
      // eslint-disable-next-line no-await-in-loop
      await deliver(message);
      expect(message.delete).not.toHaveBeenCalled();
    }
  });

  it('ignores messages from other users', async () => {
    vi.useFakeTimers();
    const message = makeMessage('human', {author: {id: 'someone-else'}});
    rememberOwnMessage('human');

    await deliver(message);

    expect(message.delete).not.toHaveBeenCalled();
  });
});
