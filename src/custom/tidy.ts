// LiviMuse: delete the bot's short confirmations ("volume set to 30%", "paused",
// "... added to the queue") after LIVIMUSE_TIDY_SECONDS, so the channel stays
// readable. Anything with a card, embed, or buttons is kept, and so is anything
// naming a person ("skipped by @x"), so there's still a record of who did what.
//
// Only messages this process sent are ever deleted. The bot token can be shared
// with other programs that post as the same user, so being authored by the bot
// isn't enough (see ownership.ts).
import {Client, Message} from 'discord.js';
import {isLiveCard} from './controls.js';
import {installOwnershipTracking, isOwnMessage} from './ownership.js';
import {tidySeconds} from './settings.js';

let started = false;

const isConfirmation = (message: Message) => message.content.trim().length > 0
  && message.embeds.length === 0
  && message.components.length === 0
  && message.attachments.size === 0
  && message.mentions.users.size === 0
  && !isLiveCard(message.id);

export const startTidying = (client: Client): void => {
  const seconds = tidySeconds();

  if (started || seconds === 0) {
    return;
  }

  started = true;
  installOwnershipTracking(client);

  client.on('messageCreate', message => {
    if (!message.guildId || message.author.id !== client.user?.id) {
      return;
    }

    // Decide when it's due, not now: /play replies start as "thinking..." and are
    // edited later, and our own record of what we sent is complete by then.
    setTimeout(() => {
      message.fetch()
        .then(async fresh => {
          if (isOwnMessage(fresh) && isConfirmation(fresh)) {
            await fresh.delete();
          }
        })
        .catch(() => undefined);
    }, seconds * 1000).unref();
  });
};
