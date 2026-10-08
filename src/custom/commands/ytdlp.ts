// LiviMuse: /ytdlp status | update | stable | nightly. yt-dlp is shared by every
// server this bot is in, so only server admins (Administrator or Manage Server)
// and the bot's owner can use it. Replies are private.
import {ChatInputCommandInteraction, PermissionFlagsBits} from 'discord.js';
import {SlashCommandBuilder} from '@discordjs/builders';
import {injectable} from 'inversify';
import Command from '../../commands/index.js';
import {messages} from '../messages.js';
import {switchYtDlpChannel, updateYtDlpNow, type YtDlpUpdateOutcome, ytDlpStatus} from '../yt-dlp-updates.js';

const isBotOwner = async (interaction: ChatInputCommandInteraction) => {
  const application = await interaction.client.application.fetch().catch(() => null);
  const owner = application?.owner;

  if (!owner) {
    return false;
  }

  return 'members' in owner ? owner.members.has(interaction.user.id) : owner.id === interaction.user.id;
};

const describeOutcome = ({channel, before, after}: YtDlpUpdateOutcome) => (before === after
  ? messages.ytdlpAlreadyCurrent(channel, after ?? 'unknown')
  : messages.ytdlpUpdated(channel, before ?? 'unknown', after ?? 'unknown'));

@injectable()
export default class implements Command {
  public readonly slashCommand = new SlashCommandBuilder()
    .setName('ytdlp')
    .setDescription('check or update yt-dlp, the YouTube downloader')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
    .addSubcommand(subcommand => subcommand
      .setName('status')
      .setDescription('show the yt-dlp version and update channel'))
    .addSubcommand(subcommand => subcommand
      .setName('update')
      .setDescription('check for a newer yt-dlp right now'))
    .addSubcommand(subcommand => subcommand
      .setName('stable')
      .setDescription('use stable yt-dlp releases'))
    .addSubcommand(subcommand => subcommand
      .setName('nightly')
      .setDescription('use nightly yt-dlp builds (newest fixes, less tested)'));

  public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const permissions = interaction.memberPermissions;
    const isAdmin = Boolean(permissions?.has(PermissionFlagsBits.Administrator) || permissions?.has(PermissionFlagsBits.ManageGuild));

    if (!isAdmin && !await isBotOwner(interaction)) {
      throw new Error(messages.ytdlpAdminsOnly);
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'status') {
      const {version, channel, lastCheck} = await ytDlpStatus();
      const lines = [messages.ytdlpStatus(version ?? 'unknown', channel)];

      if (lastCheck) {
        const when = `<t:${Math.round(lastCheck.at.getTime() / 1000)}:R>`;
        lines.push(lastCheck.outcome
          ? messages.ytdlpLastCheck(when, describeOutcome(lastCheck.outcome))
          : messages.ytdlpLastCheckFailed(when, lastCheck.error ?? 'unknown error'));
      }

      if (channel === 'nightly') {
        lines.push(messages.ytdlpNightlyReminder);
      }

      await interaction.reply({content: lines.join('\n'), ephemeral: true});
      return;
    }

    // pip can take a while; errors after this show privately via bot.ts.
    await interaction.deferReply({ephemeral: true});

    const outcome = subcommand === 'update'
      ? await updateYtDlpNow()
      : await switchYtDlpChannel(subcommand === 'nightly' ? 'nightly' : 'stable');

    await interaction.editReply(describeOutcome(outcome));
  }
}
