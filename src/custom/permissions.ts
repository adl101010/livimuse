// LiviMuse: who may control playback. With LIVIMUSE_DJ_ROLE set, only admins,
// Manage Server, and members with a matching role (by name, in any server) may
// use the card buttons and most commands. Everyone else can only use the
// commands in LIVIMUSE_OPEN_COMMANDS (default: play).
import {ChatInputCommandInteraction, GuildMemberRoleManager, Interaction, PermissionFlagsBits} from 'discord.js';
import {interfaces} from 'inversify';
import Command from '../commands/index.js';
import {TYPES} from '../types.js';
import {messages} from './messages.js';
import {djRoleLabel, djRoleNames, openCommands} from './settings.js';

// /play options that would let someone skip or jump the queue.
const DJ_ONLY_PLAY_OPTIONS = ['immediate', 'skip'];

export const isDj = (interaction: Interaction): boolean => {
  const roleNames = djRoleNames();

  if (roleNames.length === 0) {
    return true;
  }

  const permissions = interaction.memberPermissions;

  if (permissions?.has(PermissionFlagsBits.Administrator) || permissions?.has(PermissionFlagsBits.ManageGuild)) {
    return true;
  }

  const {member, guild} = interaction;

  if (!member || !guild) {
    return false;
  }

  const roleIds = member.roles instanceof GuildMemberRoleManager ? [...member.roles.cache.keys()] : member.roles;

  return roleIds.some(id => {
    const name = guild.roles.cache.get(id)?.name.toLowerCase();
    return name !== undefined && roleNames.includes(name);
  });
};

export const assertDj = (interaction: Interaction): void => {
  if (!isDj(interaction)) {
    throw new Error(messages.djOnly(djRoleLabel()));
  }
};

const assertCanUseCommand = (interaction: ChatInputCommandInteraction) => {
  if (isDj(interaction)) {
    return;
  }

  if (!openCommands().includes(interaction.commandName)) {
    throw new Error(messages.djOnly(djRoleLabel()));
  }

  if (interaction.commandName === 'play' && DJ_ONLY_PLAY_OPTIONS.some(option => interaction.options.getBoolean(option))) {
    throw new Error(messages.djOnlyPlayOptions(djRoleLabel()));
  }
};

// Wrap every command (Muse's and ours) with the check as it's created, so no
// command file needs to change. bot.ts shows the thrown error privately.
export const gateCommands = (container: interfaces.Container): void => {
  container.onActivation<Command>(TYPES.Command, (_context, command) => {
    const execute = command.execute.bind(command);

    command.execute = async interaction => {
      assertCanUseCommand(interaction);
      await execute(interaction);
    };

    return command;
  });
};
