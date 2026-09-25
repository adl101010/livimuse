// LiviMuse: handles presses on the "now playing" card buttons, and adds
// /controls to post a fresh card at the bottom of the chat.
import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  Client,
  ComponentType,
  GuildMember,
  ModalSubmitInteraction,
  TextInputStyle,
} from 'discord.js';
import {SlashCommandBuilder} from '@discordjs/builders';
import {inject, injectable} from 'inversify';
import {TYPES} from '../../types.js';
import PlayerManager from '../../managers/player.js';
import Player, {STATUS} from '../../services/player.js';
import Command from '../../commands/index.js';
import {getMemberVoiceChannel} from '../../utils/channels.js';
import errorMsg from '../../utils/error-msg.js';
import {parseTime, prettyTime} from '../../utils/time.js';
import durationStringToSeconds from '../../utils/duration-string-to-seconds.js';
import {
  buildCard,
  clearLastAction,
  controlIds,
  enableLiveCards,
  forgetCard,
  SEEK_STEP_SECONDS,
  setLastAction,
  setLastActionText,
  trackCard,
  withCardLock,
} from '../controls.js';
import {messages} from '../messages.js';
import {assertDj, isDj} from '../permissions.js';
import {openCommands} from '../settings.js';
import {clearVoiceStatus, startVoiceStatus} from '../voice-status.js';
import {startPreloading} from '../preload.js';
import {castSkipVote, clearSkipVotes} from '../vote-skip.js';
import AddQueryToQueue from '../../services/add-query-to-queue.js';
import {startYtDlpUpdates} from '../yt-dlp-updates.js';

const JUMP_MODAL_ID = 'livimuse:jump-modal';
const JUMP_FIELD_ID = 'time';
const JUMP_TIMEOUT_MS = 2 * 60 * 1000;
const ADD_MODAL_ID = 'livimuse:add-modal';
const ADD_FIELD_ID = 'query';
const ADD_TIMEOUT_MS = 5 * 60 * 1000;

const cardPayload = (player: Player) => (player.getCurrent() ? buildCard(player) : {embeds: [], components: []});

const parseJumpTime = (input: string): number => {
  const time = input.trim();

  if (time.includes(':')) {
    if (!/^\d+(?::\d+)+$/.test(time)) {
      throw new Error('invalid seek value');
    }

    return parseTime(time);
  }

  return durationStringToSeconds(time);
};

@injectable()
export default class implements Command {
  public readonly slashCommand = new SlashCommandBuilder()
    .setName('controls')
    .setDescription('show the player with playback buttons');

  public readonly handledButtonIds = Object.values(controlIds);

  private readonly playerManager: PlayerManager;
  private readonly addQueryToQueue: AddQueryToQueue;

  constructor(
    @inject(TYPES.Managers.Player) playerManager: PlayerManager,
    @inject(TYPES.Client) client: Client,
    @inject(TYPES.Services.AddQueryToQueue) addQueryToQueue: AddQueryToQueue,
  ) {
    this.playerManager = playerManager;
    this.addQueryToQueue = addQueryToQueue;
    enableLiveCards(guildId => playerManager.get(guildId), client);
    // This command is created once at startup, so it also starts our background jobs.
    startYtDlpUpdates();
    startVoiceStatus(client, guildId => playerManager.get(guildId));
    startPreloading(client, guildId => playerManager.get(guildId));
  }

  public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const player = this.playerManager.get(interaction.guild!.id);

    if (!player.getCurrent()) {
      throw new Error('nothing is currently playing');
    }

    trackCard(await interaction.reply({...cardPayload(player), fetchReply: true}));
  }

  // Errors thrown before the press is acknowledged are shown privately by bot.ts.
  public async handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
    const dj = isDj(interaction);
    const {customId} = interaction;

    // Without the DJ role you can still vote to skip, and add songs if /play is open.
    const allowed = dj
      || customId === controlIds.skip
      || (customId === controlIds.add && openCommands().includes('play'));

    if (!allowed) {
      assertDj(interaction);
    }

    const player = this.playerManager.get(interaction.guildId!);
    this.assertInPlayerChannel(interaction, player);

    switch (customId) {
      case controlIds.skip:
        await (dj || player.getCurrent()?.requestedBy === interaction.user.id
          ? this.changeSong(interaction, player)
          : this.voteSkip(interaction, player));
        break;
      case controlIds.back:
        await this.changeSong(interaction, player);
        break;
      case controlIds.add:
        await this.addSong(interaction);
        break;
      case controlIds.stop:
        await this.stop(interaction, player);
        break;
      case controlIds.jump:
        await this.jump(interaction, player);
        break;
      default:
        await this.updateInPlace(interaction, player);
    }
  }

  private assertInPlayerChannel(interaction: ButtonInteraction, player: Player) {
    const memberChannelId = (interaction.member as GuildMember | null)?.voice.channelId;

    if (!memberChannelId) {
      throw new Error(messages.controlsNotInVoice);
    }

    const botChannelId = player.voiceConnection?.joinConfig.channelId;

    if (botChannelId && botChannelId !== memberChannelId) {
      throw new Error(messages.controlsWrongChannel);
    }
  }

  private assertSeekable(player: Player) {
    const song = player.getCurrent();

    if (!song) {
      throw new Error('nothing is playing');
    }

    if (song.isLive) {
      throw new Error('can\'t seek in a livestream');
    }

    return song;
  }

  // Pause/resume and ±15s: edit the card the button is on.
  private async updateInPlace(interaction: ButtonInteraction, player: Player) {
    this.validateInPlace(interaction.customId, player);

    await interaction.deferUpdate();

    try {
      await withCardLock(interaction.guildId!, async () => {
        await this.performInPlace(interaction, player);
        await interaction.editReply(cardPayload(player));
      });
    } catch (error: unknown) {
      await interaction.followUp({content: errorMsg(error as Error), ephemeral: true}).catch(() => undefined);
    }
  }

  // Checks run before acknowledging, so failures show as a private error.
  private validateInPlace(customId: string, player: Player) {
    switch (customId) {
      case controlIds.playPause:
        if (player.status !== STATUS.PLAYING && !player.getCurrent()) {
          throw new Error('nothing to play');
        }

        break;
      case controlIds.rewind:
        this.assertSeekable(player);
        break;
      case controlIds.forward:
        if (player.getPosition() + SEEK_STEP_SECONDS >= this.assertSeekable(player).length) {
          throw new Error('can\'t seek past the end of the song');
        }

        break;
      default:
        throw new Error('unknown button');
    }
  }

  private async performInPlace(interaction: ButtonInteraction, player: Player) {
    const {guildId, user} = interaction;

    switch (interaction.customId) {
      case controlIds.playPause:
        setLastAction(guildId!, await this.togglePlayback(interaction, player), user.id);
        break;
      case controlIds.rewind:
        await player.seek(Math.max(0, player.getPosition() - SEEK_STEP_SECONDS));
        setLastAction(guildId!, messages.actionRewound(SEEK_STEP_SECONDS), user.id);
        break;
      case controlIds.forward:
        await player.seek(Math.min(player.getPosition() + SEEK_STEP_SECONDS, this.assertSeekable(player).length - 1));
        setLastAction(guildId!, messages.actionForwarded(SEEK_STEP_SECONDS), user.id);
        break;
      default:
        break;
    }
  }

  private async togglePlayback(interaction: ButtonInteraction, player: Player) {
    if (player.status === STATUS.PLAYING) {
      player.pause();
      return messages.actionPaused;
    }

    await this.ensureConnected(interaction, player);
    await player.play();
    return messages.actionResumed;
  }

  // Like /resume: rejoin the presser's channel if the bot left voice.
  private async ensureConnected(interaction: ButtonInteraction, player: Player) {
    if (player.voiceConnection) {
      return;
    }

    const [channel] = getMemberVoiceChannel(interaction.member as GuildMember) ?? [];

    if (channel) {
      await player.connect(channel);
    }
  }

  // Skip and back post a new card, which strips the buttons off this one.
  private async changeSong(interaction: ButtonInteraction, player: Player, announcement?: string) {
    const isSkip = interaction.customId === controlIds.skip;

    if (isSkip && !player.canGoForward(1)) {
      throw new Error('no song to skip to');
    }

    if (!isSkip && !player.canGoBack()) {
      throw new Error('no song to go back to');
    }

    // Acknowledge without posting anything, then post the new card as its own
    // message. (A deferred private reply plus follow-up can end up replacing and
    // then deleting the card.)
    await interaction.deferUpdate();

    try {
      await this.ensureConnected(interaction, player);

      try {
        await (isSkip ? player.forward(1) : player.back());
      } catch (error: unknown) {
        if (error instanceof Error && error.message.startsWith('No songs in queue')) {
          throw new Error(isSkip ? 'no song to skip to' : 'no song to go back to');
        }

        throw error;
      }

      clearSkipVotes(interaction.guildId!);
      const action = announcement
        ? setLastActionText(interaction.guildId!, announcement)
        : setLastAction(interaction.guildId!, isSkip ? messages.actionSkipped : messages.actionWentBack, interaction.user.id);

      trackCard(await interaction.followUp({
        content: action,
        ...cardPayload(player),
        allowedMentions: {parse: []},
      }));
    } catch (error: unknown) {
      await interaction.followUp({content: errorMsg(error as Error), ephemeral: true}).catch(() => undefined);
    }
  }

  private async stop(interaction: ButtonInteraction, player: Player) {
    if (!player.voiceConnection) {
      throw new Error('not connected');
    }

    await clearVoiceStatus(interaction.guildId!);
    player.stop();
    forgetCard(interaction.guildId!);
    clearLastAction(interaction.guildId!);
    await interaction.update({components: []});
    await interaction.followUp({
      content: messages.byUser(messages.actionStopped, `<@${interaction.user.id}>`),
      allowedMentions: {parse: []},
    });
  }

  // Non-DJs: count the vote, and skip once enough listeners agree.
  private async voteSkip(interaction: ButtonInteraction, player: Player) {
    if (!player.canGoForward(1)) {
      throw new Error('no song to skip to');
    }

    const vote = castSkipVote(interaction.guild!, player, interaction.user.id);

    if (vote.passed) {
      await this.changeSong(interaction, player, messages.skippedByVote(vote.count, vote.needed));
      return;
    }

    if (vote.alreadyVoted) {
      throw new Error(messages.alreadyVoted);
    }

    await interaction.deferUpdate();

    try {
      await withCardLock(interaction.guildId!, async () => {
        setLastAction(interaction.guildId!, messages.actionVoted(vote.count, vote.needed), interaction.user.id);
        await interaction.editReply(cardPayload(player));
      });
    } catch (error: unknown) {
      await interaction.followUp({content: errorMsg(error as Error), ephemeral: true}).catch(() => undefined);
    }
  }

  // ➕ Add song: a pop-up, then exactly what /play does with that text.
  private async addSong(interaction: ButtonInteraction) {
    await interaction.showModal({
      customId: ADD_MODAL_ID,
      title: messages.addSongTitle,
      components: [{
        type: ComponentType.ActionRow,
        components: [{
          type: ComponentType.TextInput,
          customId: ADD_FIELD_ID,
          label: messages.addSongField,
          style: TextInputStyle.Short,
          required: true,
          maxLength: 300,
        }],
      }],
    });

    const submitted = await interaction.awaitModalSubmit({
      time: ADD_TIMEOUT_MS,
      filter: modal => modal.customId === ADD_MODAL_ID && modal.user.id === interaction.user.id,
    }).catch(() => null);

    if (!submitted) {
      return;
    }

    try {
      // AddQueryToQueue only uses guild, member, channel, deferReply and editReply,
      // which a pop-up submission has too.
      await this.addQueryToQueue.addToQueue({
        interaction: submitted as unknown as ChatInputCommandInteraction,
        query: submitted.fields.getTextInputValue(ADD_FIELD_ID).trim(),
        addToFrontOfQueue: false,
        shuffleAdditions: false,
        shouldSplitChapters: false,
        skipCurrentTrack: false,
      });
    } catch (error: unknown) {
      const content = errorMsg(error as Error);
      await (submitted.deferred || submitted.replied
        ? submitted.editReply(content)
        : submitted.reply({content, ephemeral: true})).catch(() => undefined);
    }
  }

  private async jump(interaction: ButtonInteraction, player: Player) {
    this.assertSeekable(player);

    await interaction.showModal({
      customId: JUMP_MODAL_ID,
      title: messages.jumpToTitle,
      components: [{
        type: ComponentType.ActionRow,
        components: [{
          type: ComponentType.TextInput,
          customId: JUMP_FIELD_ID,
          label: messages.jumpToField,
          placeholder: '2:30',
          style: TextInputStyle.Short,
          required: true,
          maxLength: 10,
        }],
      }],
    });

    const submitted = await interaction.awaitModalSubmit({
      time: JUMP_TIMEOUT_MS,
      filter: modal => modal.customId === JUMP_MODAL_ID && modal.user.id === interaction.user.id,
    }).catch(() => null);

    if (submitted) {
      await this.handleJumpSubmit(submitted, player);
    }
  }

  private async handleJumpSubmit(submitted: ModalSubmitInteraction, player: Player) {
    let target: number;

    try {
      const song = this.assertSeekable(player);
      target = parseJumpTime(submitted.fields.getTextInputValue(JUMP_FIELD_ID));

      if (!Number.isFinite(target) || target < 0) {
        throw new Error('invalid seek value');
      }

      if (target >= song.length) {
        throw new Error('can\'t seek past the end of the song');
      }
    } catch (error: unknown) {
      await submitted.reply({content: errorMsg(error as Error), ephemeral: true});
      return;
    }

    if (!submitted.isFromMessage()) {
      return;
    }

    await submitted.deferUpdate();

    try {
      await withCardLock(submitted.guildId!, async () => {
        await player.seek(target);
        setLastAction(submitted.guildId!, messages.actionJumped(prettyTime(target)), submitted.user.id);
        await submitted.editReply(cardPayload(player));
      });
    } catch (error: unknown) {
      await submitted.followUp({content: errorMsg(error as Error), ephemeral: true}).catch(() => undefined);
    }
  }
}
