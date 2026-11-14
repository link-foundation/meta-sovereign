import { createGreetingSends } from '../../src/sources/telegram-greeting-send.js';
import { messageAck } from './telegram-message-ack.mjs';
import { named } from './telegram-route.js';
import {
  greetingStickerFixture,
  refreshedCatalog,
} from './greeting-stickers-fakes.mjs';

export const greetingGate = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
export const greetingSendFixture = async (options = {}) => {
  const fixture = greetingStickerFixture(options);
  await refreshedCatalog(fixture);
  const entities = new Map([
    [
      '@GreetingBot',
      { className: 'User', id: 9n, firstName: 'Greeting bot', bot: true },
    ],
    [
      '@GreetingUser',
      { className: 'User', id: 8n, firstName: 'Greeting user' },
    ],
    ['@GreetingGroup', { className: 'Chat', id: 44n, title: 'Greeting group' }],
    [
      '@GreetingChannel',
      { className: 'Channel', id: 44n, title: 'Greeting channel' },
    ],
  ]);
  fixture.c.Api.messages.SendMessage = named('SendMessage');
  const previous = fixture.client.invoke;
  fixture.client.invoke = async (request) => {
    if (request.className === 'SendMessage') {
      fixture.calls.push(request);
      return messageAck(request);
    }
    return previous(request);
  };
  fixture.client.getEntity = async (selector) => {
    const found = entities.get(String(selector));
    if (found) {
      return found;
    }
    const number = String(selector);
    if (!/^-?[1-9]\d*$/.test(number)) {
      throw new Error('unavailable');
    }
    const kind = number.startsWith('-100')
      ? 'Channel'
      : number.startsWith('-')
        ? 'Chat'
        : 'User';
    return {
      className: kind,
      id: BigInt(number.replace(/^-100|^-/, '')),
      bot: number === '9',
    };
  };
  fixture.client.getInputEntity = async (entity) => ({
    [{ User: 'userId', Chat: 'chatId', Channel: 'channelId' }[
      entity.className
    ]]: entity.id,
    accessHash: 123n,
  });
  const context = {
    userClient: async () => fixture.client,
    apply: async () => {},
    greetingSticker: fixture.catalog.select,
    sendDocument: fixture.sendDocument,
  };
  const create = () => createGreetingSends(fixture.env, context, options);
  const sends = () =>
    fixture.calls.filter((call) =>
      ['SendMedia', 'SendMessage'].includes(call.className)
    );
  return { ...fixture, context, create, sends, entities, actions: create() };
};
