// LiviMuse: remember which messages THIS process sent.
//
// The bot token can be shared with other programs, which post as the same Discord
// user. "Authored by the bot" therefore doesn't mean "sent by LiviMuse", so
// anything that acts on our own messages (like tidy) must not rely on the author.
//
// Every message we send goes through discord.js's REST client. We watch the
// responses to the calls that create messages, and the interaction callbacks we
// answer, and keep a bounded record of both.
import type {Client, Message} from 'discord.js';

const MAX_REMEMBERED = 5000;

// A Set that forgets its oldest entries, so memory stays bounded.
class BoundedSet {
  private readonly values = new Set<string>();

  constructor(private readonly limit: number) {}

  add(value: string) {
    this.values.delete(value);
    this.values.add(value);

    if (this.values.size > this.limit) {
      const oldest = this.values.values().next().value as string;
      this.values.delete(oldest);
    }
  }

  has(value: string) {
    return this.values.has(value);
  }

  get size() {
    return this.values.size;
  }
}

const messageIds = new BoundedSet(MAX_REMEMBERED);
const interactionIds = new BoundedSet(MAX_REMEMBERED);

// POST /channels/{id}/messages         channel.send()
// POST /webhooks/{app}/{token}         interaction.followUp()
// PATCH /webhooks/{app}/{token}/messages/{id}   interaction.editReply()
const MESSAGE_CREATING_ROUTES: Array<{method: string; route: RegExp}> = [
  {method: 'POST', route: /^\/channels\/\d+\/messages$/},
  {method: 'POST', route: /^\/webhooks\/\d+\/[^/]+$/},
  {method: 'PATCH', route: /^\/webhooks\/\d+\/[^/]+\/messages\/[^/]+$/},
];

// POST /interactions/{id}/{token}/callback   interaction.reply() / deferReply()
const INTERACTION_CALLBACK = /^\/interactions\/(\d+)\/[^/]+\/callback$/;

type RestRequest = {fullRoute: string; method: string};

export const recordRestResult = (request: RestRequest, result: unknown) => {
  const callback = INTERACTION_CALLBACK.exec(request.fullRoute);

  if (callback && request.method === 'POST') {
    interactionIds.add(callback[1]);
    return;
  }

  const creates = MESSAGE_CREATING_ROUTES.some(({method, route}) => method === request.method && route.test(request.fullRoute));

  if (creates && result !== null && typeof result === 'object') {
    const {id} = result as {id?: unknown};

    if (typeof id === 'string') {
      messageIds.add(id);
    }
  }
};

let installed = false;

// Call once with the client. Wraps its REST client's request method.
export const installOwnershipTracking = (client: Pick<Client, 'rest'>): void => {
  if (installed) {
    return;
  }

  installed = true;

  const {rest} = client;
  const original = rest.request.bind(rest);

  rest.request = async options => {
    const result = await original(options);

    try {
      recordRestResult({fullRoute: String(options.fullRoute), method: String(options.method)}, result);
    } catch {
      // Tracking must never break sending.
    }

    return result;
  };
};

// True only for messages this process sent: either we saw the API return the
// message, or it's the response to an interaction we answered.
export const isOwnMessage = (message: Pick<Message, 'id' | 'interaction'>): boolean => {
  if (messageIds.has(message.id)) {
    return true;
  }

  const interactionId = message.interaction?.id;

  return typeof interactionId === 'string' && interactionIds.has(interactionId);
};

// For tests.
export const rememberOwnMessage = (messageId: string) => {
  messageIds.add(messageId);
};

export const rememberOwnInteraction = (interactionId: string) => {
  interactionIds.add(interactionId);
};
