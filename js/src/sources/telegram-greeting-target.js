import { exportTarget } from './telegram-export-target.js';

export const greetingFailure = (code) =>
  Object.assign(new Error(code), { code });
export const greetingSendRequest = (body = {}) => {
  const chat = exportTarget(body.chat);
  const operation = body.operation ?? 'greeting-sticker';
  const sticker = body.sticker ?? null;
  return chat &&
    ['bot-start', 'greeting-sticker'].includes(operation) &&
    (sticker === null ||
      (operation === 'greeting-sticker' &&
        typeof sticker === 'string' &&
        /^[1-9]\d{0,19}$/.test(sticker)))
    ? { chat, operation, sticker }
    : null;
};
const text = (value) => String(value?.value ?? value ?? '');
const prefixes = { User: '', Chat: '-', Channel: '-100' };
export const greetingTarget = (entity, operation) => {
  const id = text(entity?.id);
  const kind = entity?.className;
  if (
    !Object.hasOwn(prefixes, kind) ||
    !/^[1-9]\d{0,15}$/.test(id) ||
    entity.deleted ||
    entity.restricted
  ) {
    throw greetingFailure('target-unavailable');
  }
  if (operation === 'bot-start' && (kind !== 'User' || entity.bot !== true)) {
    throw greetingFailure('bot-required');
  }
  return {
    chat: `${prefixes[kind]}${id}`,
    kind,
    bot: entity.bot === true,
    name: String(
      entity.title || entity.firstName || entity.username || id
    ).slice(0, 256),
  };
};
export const resolveGreetingTarget = async (c, selector, operation) => {
  const entity = await c.client.getEntity(
    selector.startsWith('@') ? selector : c.helpers.returnBigInt(selector)
  );
  const target = greetingTarget(entity, operation);
  if (!selector.startsWith('@') && selector !== target.chat) {
    throw greetingFailure('target-changed');
  }
  return { entity, target };
};
export const greetingInputMatches = (peer, target) => {
  const field = { User: 'userId', Chat: 'chatId', Channel: 'channelId' }[
    target.kind
  ];
  return `${prefixes[target.kind]}${text(peer?.[field])}` === target.chat;
};
