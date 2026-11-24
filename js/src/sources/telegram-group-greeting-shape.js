import { greetingTarget, greetingFailure } from './telegram-greeting-target.js';
import {
  contactExclusion,
  userProfile,
  userKey,
} from './telegram-chat-users-shape.js';
import { inputUserOf } from './telegram-peer-actions.js';
import { runIn } from './telegram-stickers.js';

export const greetingGroup = (entity) =>
  !entity?.deactivated &&
  !entity?.left &&
  !entity?.restricted &&
  (entity?.className === 'Chat' ||
    (entity?.className === 'Channel' &&
      entity.megagroup === true &&
      !entity.broadcast));
export const groupGreetingOptions = (body = {}) => {
  const options = {
    limit: body.limit ?? 0,
    delayMs: body.delayMs ?? 30_000,
    sticker: body.sticker ?? null,
  };
  return Number.isInteger(options.limit) &&
    options.limit >= 0 &&
    options.limit <= 100_000 &&
    Number.isInteger(options.delayMs) &&
    options.delayMs >= 0 &&
    options.delayMs <= 3_600_000 &&
    (options.sticker === null ||
      (typeof options.sticker === 'string' &&
        /^[1-9]\d{0,19}$/.test(options.sticker)))
    ? options
    : null;
};
export const groupGreetingExclusion = (user, meId) =>
  contactExclusion(user, { meId, includeExisting: true }) ??
  (user.verified
    ? 'verified'
    : user.business || user.botBusiness
      ? 'business'
      : user.businessChecked !== true
        ? 'business-unavailable'
        : null);

export const resolveGreetingGroup = async (c, selector) => {
  const entity = await c.client.getEntity(
    selector.startsWith('@') ? selector : c.helpers.returnBigInt(selector)
  );
  const target = greetingTarget(entity, 'greeting-sticker');
  if (
    !greetingGroup(entity) ||
    (!selector.startsWith('@') && target.chat !== selector)
  ) {
    throw greetingFailure('group-required');
  }
  return { entity, target };
};
const businessFields = [
  'businessWorkHours',
  'businessLocation',
  'businessGreetingMessage',
  'businessAwayMessage',
  'businessIntro',
];
export const greetingRecipient = async (env, c, entity, meId, key) => {
  const profile = userProfile(entity);
  if (!profile) {
    throw greetingFailure('target-unavailable');
  }
  if (
    contactExclusion(profile, { meId, includeExisting: true }) ||
    profile.verified ||
    entity.business ||
    entity.botBusiness
  ) {
    return {
      ...profile,
      business: Boolean(entity.business || entity.botBusiness),
      businessChecked: true,
    };
  }
  const full = await runIn(
    env,
    `greeting-group:business:${key}:${profile.id}`,
    async () => {
      const peer = await c.client.getInputEntity(entity);
      if (
        userKey(peer.userId) !== profile.id ||
        peer.chatId ||
        peer.channelId
      ) {
        throw greetingFailure('target-changed');
      }
      return c.client.invoke(
        new c.Api.users.GetFullUser({ id: await inputUserOf(c, peer) })
      );
    }
  );
  if (
    full?.fullUser?.className !== 'UserFull' ||
    userKey(full.fullUser) !== profile.id
  ) {
    throw greetingFailure('business-unavailable');
  }
  return {
    ...profile,
    businessChecked: true,
    business: businessFields.some((field) => Boolean(full.fullUser[field])),
  };
};
