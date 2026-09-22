// LiviMuse: template for a custom command. Not registered by default; see
// ./index.ts. Music commands can inject PlayerManager the same way
// src/commands/disconnect.ts does.
import {ChatInputCommandInteraction} from 'discord.js';
import {SlashCommandBuilder} from '@discordjs/builders';
import {injectable} from 'inversify';
import Command from '../../commands/index.js';

@injectable()
export default class implements Command {
  public readonly slashCommand = new SlashCommandBuilder()
    .setName('hello')
    .setDescription('say hi')
    .addStringOption(option => option
      .setName('name')
      .setDescription('who to greet')
      .setRequired(false));

  public async execute(interaction: ChatInputCommandInteraction) {
    const name = interaction.options.getString('name') ?? interaction.user.username;

    await interaction.reply(`hey ${name} 👋`);
  }
}
