// LiviMuse: our own slash commands. Add a file next to this one (copy
// example.ts), import it here, and add it to the list. Discord picks up new
// commands when the bot restarts.
import {interfaces} from 'inversify';
import Command from '../../commands/index.js';
// To enable the template: import Example from './example.js';

export const customCommands: Array<interfaces.Newable<Command>> = [
  // Example,
];
