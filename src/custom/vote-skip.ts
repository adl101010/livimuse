// LiviMuse: vote skip for people without the DJ role. A song skips once more
// than LIVIMUSE_VOTE_SKIP_PERCENT of the (non-bot) listeners in the bot's voice
// channel have voted. Votes belong to one song and reset when it changes.
import {Guild} from 'discord.js';
import type Player from '../services/player.js';
import {voteSkipPercent} from './settings.js';

type Votes = {
  entryId: number | null;
  voters: Set<string>;
  needed: number;
};

const votesByGuild = new Map<string, Votes>();

const listenerIds = (guild: Guild, player: Player): string[] => {
  const channelId = player.voiceConnection?.joinConfig.channelId;
  const channel = channelId ? guild.channels.cache.get(channelId) : undefined;

  if (!channel?.isVoiceBased()) {
    return [];
  }

  return [...channel.members.values()].filter(member => !member.user.bot).map(member => member.id);
};

// "More than X%": with 50, that's 1 of 1, 2 of 2, 2 of 3, 3 of 4, 3 of 5.
export const votesNeeded = (listeners: number): number =>
  Math.max(1, Math.min(listeners, Math.floor(listeners * voteSkipPercent() / 100) + 1));

export type VoteResult = {
  alreadyVoted: boolean;
  count: number;
  needed: number;
  passed: boolean;
};

export const castSkipVote = (guild: Guild, player: Player, userId: string): VoteResult => {
  const entryId = player.getCurrentQueueEntryId();
  let votes = votesByGuild.get(guild.id);

  if (!votes || votes.entryId !== entryId) {
    votes = {entryId, voters: new Set(), needed: 1};
    votesByGuild.set(guild.id, votes);
  }

  const alreadyVoted = votes.voters.has(userId);
  votes.voters.add(userId);

  // Only people still in the channel count, and the target follows who's listening now.
  const listeners = listenerIds(guild, player);

  for (const voter of votes.voters) {
    if (!listeners.includes(voter)) {
      votes.voters.delete(voter);
    }
  }

  votes.needed = votesNeeded(listeners.length);

  return {alreadyVoted, count: votes.voters.size, needed: votes.needed, passed: votes.voters.size >= votes.needed};
};

// "1/2" for the skip button while a vote is open on the current song.
export const skipVoteProgress = (player: Player): string | undefined => {
  const votes = votesByGuild.get(player.guildId);

  if (!votes || votes.entryId !== player.getCurrentQueueEntryId() || votes.voters.size === 0) {
    return undefined;
  }

  return `${votes.voters.size}/${votes.needed}`;
};

export const clearSkipVotes = (guildId: string): void => {
  votesByGuild.delete(guildId);
};
