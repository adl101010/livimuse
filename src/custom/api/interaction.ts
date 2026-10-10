// LiviMuse: a stand-in for the slash command interaction, so the control API can
// run the exact same code path as /play (AddQueryToQueue). That service only
// touches the guild, the member's voice channel, the channel id, and the
// deferReply / editReply calls, which is all this provides.
import type {Guild, VoiceChannel} from 'discord.js';

export interface SendableChannel {
  id: string;
  send: (payload: {embeds?: unknown[]; components?: unknown[]}) => Promise<unknown>;
}

export interface ApiInteractionOptions {
  guild: Guild;
  voiceChannel: VoiceChannel;
  textChannel?: SendableChannel;
  userId: string;
}

export class ApiInteraction {
  readonly guild: Guild;
  readonly member: {id: string; user: {id: string}; voice: {channel: VoiceChannel}};
  readonly channel: {id: string};

  // The last confirmation text the service produced, e.g. "**Song** added to the queue".
  lastText: string | undefined;

  // Whether a now-playing card was posted to the text channel.
  cardPosted = false;

  private readonly textChannel?: SendableChannel;

  constructor({guild, voiceChannel, textChannel, userId}: ApiInteractionOptions) {
    this.guild = guild;
    this.textChannel = textChannel;
    // /play joins the member's own voice channel, so present the target as theirs.
    this.member = {id: userId, user: {id: userId}, voice: {channel: voiceChannel}};
    this.channel = {id: textChannel?.id ?? voiceChannel.id};
  }

  async deferReply(): Promise<void> {
    // Nothing to defer: the HTTP response is the reply.
  }

  async editReply(payload: string | {embeds?: unknown[]; components?: unknown[]}): Promise<unknown> {
    if (typeof payload === 'string') {
      this.lastText = payload;
      return undefined;
    }

    // An embed means "show the now-playing card". Only post it if asked to.
    if (!this.textChannel) {
      return undefined;
    }

    this.cardPosted = true;

    return this.textChannel.send(payload);
  }
}
