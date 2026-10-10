// LiviMuse: the control API's HTTP server. Started once at boot (see the
// Controls command). Does nothing unless LIVIMUSE_API_TOKEN is set. The server
// listens right away so /api/health works while Discord is still connecting;
// every other route answers 503 until the client is ready.
import http from 'node:http';
import type {Client, Guild} from 'discord.js';
import {inject, injectable} from 'inversify';
import {TYPES} from '../../types.js';
import type PlayerManager from '../../managers/player.js';
import type AddQueryToQueue from '../../services/add-query-to-queue.js';
import {getMostPopularVoiceChannel} from '../../utils/channels.js';
import {buildCard, clearLastAction, liveCardChannelId, retireCard, setLastAction, trackCard} from '../controls.js';
import {apiBind, apiPort, apiToken} from '../settings.js';
import {clearVoiceStatus} from '../voice-status.js';
import {createApiHandler} from './handler.js';

const log = (line: string) => {
  console.log(`[livimuse api] ${line}`);
};

@injectable()
export default class ApiServer {
  private server?: http.Server;

  constructor(
    @inject(TYPES.Client) private readonly client: Client,
    @inject(TYPES.Managers.Player) private readonly playerManager: PlayerManager,
    @inject(TYPES.Services.AddQueryToQueue) private readonly addQueryToQueue: AddQueryToQueue,
  ) {}

  start(): void {
    const token = apiToken();

    if (token === '') {
      log('disabled (LIVIMUSE_API_TOKEN is not set)');
      return;
    }

    if (this.server) {
      return;
    }

    if (token.length < 16) {
      console.warn('[livimuse api] LIVIMUSE_API_TOKEN is short; use at least 16 random characters');
    }

    const handler = createApiHandler({
      token,
      client: this.client,
      getPlayer: guildId => this.playerManager.get(guildId),
      addToQueue: async options => this.addQueryToQueue.addToQueue(options),
      getMostPopularVoiceChannel: (guild: Guild) => {
        try {
          return getMostPopularVoiceChannel(guild)[0];
        } catch {
          return null;
        }
      },
      cards: {
        setLastAction: (guildId, action, userId) => {
          setLastAction(guildId, action, userId);
        },
        liveCardChannelId,
        postCard: async (channel, player) => {
          trackCard(await channel.send(buildCard(player)));
        },
        onStopped: async guildId => {
          await clearVoiceStatus(guildId);
          await retireCard(guildId);
          clearLastAction(guildId);
        },
      },
      log,
    });

    const server = http.createServer((req, res) => {
      handler(req, res).catch((error: unknown) => {
        log(`unhandled error: ${error instanceof Error ? error.message : String(error)}`);

        if (!res.headersSent) {
          res.writeHead(500, {'Content-Type': 'application/json'});
        }

        res.end(JSON.stringify({error: 'internal_error', message: 'something went wrong'}));
      });
    });

    server.on('error', error => {
      console.error(`[livimuse api] server error: ${error.message}`);
    });

    const port = apiPort();
    const bind = apiBind();

    server.listen(port, bind, () => {
      log(`listening on ${bind}:${port}`);
    });

    // Close cleanly on SIGTERM (docker stop), then exit: installing a handler
    // replaces Node's default of exiting.
    process.once('SIGTERM', () => {
      log('shutting down');
      server.close(() => {
        process.exit(0);
      });
      // Added in Node 18.2, so not in the @types/node we build against.
      (server as http.Server & {closeAllConnections?: () => void}).closeAllConnections?.();
      setTimeout(() => {
        process.exit(0);
      }, 3000).unref();
    });

    this.server = server;
  }
}
