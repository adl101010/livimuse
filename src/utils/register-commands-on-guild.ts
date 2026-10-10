import {REST} from '@discordjs/rest';
import Command from '../commands/index.js';
import {reconcileGuildCommands} from '../custom/command-registration.js';

interface RegisterCommandsOnGuildOptions {
  rest: REST;
  applicationId: string;
  guildId: string;
  commands: Array<Command['slashCommand']>;
}

// LiviMuse: reconcile instead of bulk-replacing the guild's commands, so other
// programs sharing this Discord application keep theirs.
const registerCommandsOnGuild = async ({rest, applicationId, guildId, commands}: RegisterCommandsOnGuildOptions) => {
  const result = await reconcileGuildCommands({rest, applicationId, guildId, commands});

  console.log(`[livimuse commands] guild ${guildId}: ${result.created.length} created, ${result.updated.length} updated, ${result.unchanged.length} unchanged, ${result.deleted.length} removed`);
};

export default registerCommandsOnGuild;
