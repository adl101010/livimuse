import {describe, expect, it, vi} from 'vitest';
import {commandsAreEqual, reconcileGuildCommands} from '../src/custom/command-registration.js';

type Payload = Record<string, unknown> & {name: string};

const makeRest = (existing: unknown[] = []) => ({
  delete: vi.fn().mockResolvedValue(undefined),
  get: vi.fn().mockResolvedValue(existing),
  post: vi.fn().mockResolvedValue(undefined),
  put: vi.fn().mockResolvedValue(undefined),
});

const command = (payload: Payload) => ({toJSON: () => payload});

const run = async (rest: ReturnType<typeof makeRest>, commands: Payload[], staleNames?: string[]) => reconcileGuildCommands({
  applicationId: 'app',
  commands: commands.map(command),
  guildId: 'guild',
  rest: rest as never,
  staleNames,
});

const GUILD_ROUTE = '/applications/app/guilds/guild/commands';

// A command as Discord returns it: our fields plus server-added metadata.
const asReturnedByDiscord = (payload: Payload): Payload => ({
  application_id: 'app',
  contexts: [0, 1, 2],
  default_member_permissions: null,
  dm_permission: true,
  guild_id: 'guild',
  id: '100',
  integration_types: [0],
  nsfw: false,
  type: 1,
  version: '1',
  ...payload,
});

describe('reconcileGuildCommands', () => {
  it('creates missing commands one at a time and never bulk-overwrites', async () => {
    const rest = makeRest([]);

    const result = await run(rest, [{description: 'a', name: 'a'}, {description: 'b', name: 'b'}]);

    expect(rest.get).toHaveBeenCalledWith(GUILD_ROUTE);
    expect(rest.post).toHaveBeenCalledTimes(2);
    expect(rest.post).toHaveBeenCalledWith(GUILD_ROUTE, {body: {description: 'a', name: 'a'}});
    expect(rest.post).toHaveBeenCalledWith(GUILD_ROUTE, {body: {description: 'b', name: 'b'}});
    expect(rest.put).not.toHaveBeenCalled();
    expect(result.created).toEqual(['a', 'b']);
  });

  it('skips commands that match what Discord already has, despite server-added fields', async () => {
    const play = {
      description: 'play a song',
      name: 'play',
      options: [
        {description: 'what to play', name: 'query', required: true, type: 3},
        {description: 'front of queue', name: 'immediate', type: 5},
      ],
    };
    const rest = makeRest([asReturnedByDiscord({
      ...play,
      options: [
        {autocomplete: false, description: 'what to play', description_localizations: null, name: 'query', name_localizations: null, required: true, type: 3},
        {description: 'front of queue', name: 'immediate', required: false, type: 5},
      ],
    })]);

    const result = await run(rest, [play]);

    expect(rest.post).not.toHaveBeenCalled();
    expect(result.unchanged).toEqual(['play']);
  });

  it('overwrites only the commands that changed', async () => {
    const rest = makeRest([
      asReturnedByDiscord({description: 'old wording', id: '1', name: 'pause'}),
      asReturnedByDiscord({description: 'same', id: '2', name: 'skip'}),
    ]);

    const result = await run(rest, [
      {description: 'new wording', name: 'pause'},
      {description: 'same', name: 'skip'},
    ]);

    expect(rest.post).toHaveBeenCalledOnce();
    expect(rest.post).toHaveBeenCalledWith(GUILD_ROUTE, {body: {description: 'new wording', name: 'pause'}});
    expect(result.updated).toEqual(['pause']);
    expect(result.unchanged).toEqual(['skip']);
  });

  it('notices a changed default permission, even when the new command sets none', async () => {
    const rest = makeRest([asReturnedByDiscord({default_member_permissions: '32', description: 'cfg', name: 'config'})]);

    await run(rest, [{description: 'cfg', name: 'config'}]);

    expect(rest.post).toHaveBeenCalledOnce();
  });

  it('notices changed options', async () => {
    const rest = makeRest([asReturnedByDiscord({
      description: 'volume',
      name: 'volume',
      options: [{description: 'level', max_value: 100, name: 'level', required: true, type: 4}],
    })]);

    await run(rest, [{
      description: 'volume',
      name: 'volume',
      options: [{description: 'level', max_value: 50, name: 'level', required: true, type: 4}],
    }]);

    expect(rest.post).toHaveBeenCalledOnce();
  });

  it('never deletes commands it does not own', async () => {
    const rest = makeRest([
      asReturnedByDiscord({description: 'recap', id: '7', name: 'recap'}),
      asReturnedByDiscord({id: '8', name: 'Link characters', type: 2}),
    ]);

    const result = await run(rest, [{description: 'play', name: 'play'}]);

    expect(rest.delete).not.toHaveBeenCalled();
    expect(result.deleted).toEqual([]);
  });

  it('deletes only names on its own stale list', async () => {
    const rest = makeRest([
      asReturnedByDiscord({description: 'old', id: '5', name: 'old-command'}),
      asReturnedByDiscord({description: 'recap', id: '6', name: 'recap'}),
    ]);

    const result = await run(rest, [{description: 'play', name: 'play'}], ['old-command']);

    expect(rest.delete).toHaveBeenCalledOnce();
    expect(rest.delete).toHaveBeenCalledWith('/applications/app/guilds/guild/commands/5');
    expect(result.deleted).toEqual(['old-command']);
  });

  it('does not delete a stale-listed name that it currently defines', async () => {
    const rest = makeRest([asReturnedByDiscord({description: 'x', id: '9', name: 'x'})]);

    await run(rest, [{description: 'x', name: 'x'}], ['x']);

    expect(rest.delete).not.toHaveBeenCalled();
  });

  it('treats a slash command and a context menu with the same name as different commands', async () => {
    const rest = makeRest([asReturnedByDiscord({id: '3', name: 'link', type: 2})]);

    const result = await run(rest, [{description: 'link a character', name: 'link'}]);

    expect(result.created).toEqual(['link']);
    expect(rest.post).toHaveBeenCalledOnce();
  });
});

describe('commandsAreEqual', () => {
  it('ignores key order', () => {
    expect(commandsAreEqual(
      {description: 'a', name: 'a', options: [{description: 'o', name: 'o', type: 3}]},
      {name: 'a', options: [{type: 3, name: 'o', description: 'o'}], description: 'a'},
    )).toBe(true);
  });

  it('sees dm_permission and nsfw differences', () => {
    expect(commandsAreEqual({description: 'a', dm_permission: false, name: 'a'}, {description: 'a', dm_permission: true, name: 'a'})).toBe(false);
    expect(commandsAreEqual({description: 'a', name: 'a', nsfw: true}, {description: 'a', name: 'a'})).toBe(false);
  });
});
