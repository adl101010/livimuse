// LiviMuse: command registration that is safe on a Discord application shared
// with other programs. The bot token can be shared, which means other programs
// register slash commands on the same application. A bulk PUT (Muse's default)
// replaces everything in the guild, so whichever program starts last would wipe
// the others' commands. Instead this creates or overwrites only the commands
// LiviMuse defines, one by one, skips the ones that haven't changed, and deletes
// only names listed in STALE_COMMAND_NAMES. It never touches the global scope.
import type {REST} from '@discordjs/rest';
import {Routes} from 'discord-api-types/v10';

// Names LiviMuse (or Muse) defined in the past but no longer does, so they can
// be removed from guilds. Never put a name here that another program owns.
export const STALE_COMMAND_NAMES: readonly string[] = [];

type CommandPayload = {[key: string]: unknown; name: string; type?: number};

type ExistingCommand = CommandPayload & {id: string};

export interface ReconcileOptions {
  rest: REST;
  applicationId: string;
  guildId: string;
  commands: Array<{toJSON: () => unknown}>;
  staleNames?: readonly string[];
}

export interface ReconcileResult {
  created: string[];
  updated: string[];
  unchanged: string[];
  deleted: string[];
}

// Fields Discord adds, or that we never set, which would make unchanged commands look changed.
const IGNORED_KEYS = new Set([
  'id',
  'application_id',
  'guild_id',
  'version',
  'default_permission',
  'permissions',
  'contexts',
  'integration_types',
  'handler',
]);

const isEmpty = (value: unknown) => value === null
  || value === undefined
  || value === false
  || (Array.isArray(value) && value.length === 0);

// Reduce a command (ours or Discord's copy) to what defines its behaviour, so the
// two can be compared: drop server-added metadata and default/empty values.
const comparable = (value: unknown, top = false): unknown => {
  if (Array.isArray(value)) {
    return value.map(item => comparable(item));
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};

    for (const [key, child] of Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) {
      if (IGNORED_KEYS.has(key) || isEmpty(child) || (top && key === 'type' && child === 1)) {
        continue;
      }

      result[key] = comparable(child);
    }

    return result;
  }

  return value;
};

const normalizeCommand = (command: CommandPayload) => {
  const normalized: Record<string, unknown> = {
    ...comparable(command, true) as Record<string, unknown>,
    // These have meaningful defaults, so compare them explicitly.
    default_member_permissions: command.default_member_permissions ?? null,
    dm_permission: command.dm_permission ?? true,
    nsfw: command.nsfw ?? false,
  };

  // A stable key order, so equal commands always serialize the same way.
  return Object.fromEntries(Object.entries(normalized).sort(([a], [b]) => a.localeCompare(b)));
};

export const commandsAreEqual = (desired: CommandPayload, existing: CommandPayload): boolean =>
  JSON.stringify(normalizeCommand(desired)) === JSON.stringify(normalizeCommand(existing));

const keyOf = (command: CommandPayload) => `${command.type ?? 1}:${command.name}`;

export const reconcileGuildCommands = async ({
  rest,
  applicationId,
  guildId,
  commands,
  staleNames = STALE_COMMAND_NAMES,
}: ReconcileOptions): Promise<ReconcileResult> => {
  const route = Routes.applicationGuildCommands(applicationId, guildId);
  const existing = await rest.get(route) as ExistingCommand[];
  const existingByKey = new Map(existing.map(command => [keyOf(command), command]));
  const result: ReconcileResult = {created: [], updated: [], unchanged: [], deleted: []};
  const desiredKeys = new Set<string>();

  // Sequential on purpose: gentle on rate limits, and easy to reason about.
  for (const command of commands) {
    const payload = command.toJSON() as CommandPayload;
    const key = keyOf(payload);
    const current = existingByKey.get(key);
    desiredKeys.add(key);

    if (current && commandsAreEqual(payload, current)) {
      result.unchanged.push(payload.name);
      continue;
    }

    // Creating a command with an existing name overwrites that one only.
    // eslint-disable-next-line no-await-in-loop
    await rest.post(route, {body: payload});
    (current ? result.updated : result.created).push(payload.name);
  }

  const stale = new Set(staleNames);

  for (const command of existing) {
    if (stale.has(command.name) && !desiredKeys.has(keyOf(command))) {
      // eslint-disable-next-line no-await-in-loop
      await rest.delete(Routes.applicationGuildCommand(applicationId, guildId, command.id));
      result.deleted.push(command.name);
    }
  }

  return result;
};
