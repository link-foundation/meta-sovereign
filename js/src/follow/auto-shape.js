import { backlinkFailure, backlinkInteger } from './backlink-shape.js';

export const autoFollowConfig = (input, targetSource) => {
  if (input === undefined || input === false) {
    return undefined;
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw backlinkFailure('bad-request');
  }
  const mute = input.mute ?? targetSource === 'telegram';
  const archive = input.archive ?? targetSource === 'telegram';
  if (typeof mute !== 'boolean' || typeof archive !== 'boolean') {
    throw backlinkFailure('bad-request');
  }
  if (targetSource === 'vk' && (mute || archive)) {
    throw backlinkFailure('preferences-unavailable');
  }
  return {
    maxRetries: backlinkInteger(input.maxRetries, 10, 0, 10),
    maxLinks: backlinkInteger(input.maxLinks, 100, 1, 100),
    joinDelayMs: backlinkInteger(input.joinDelayMs, 1000, 0, 60000),
    mute,
    archive,
  };
};
export const sameFollowingTarget = (source, before, after) => {
  if (!before || !after) {
    return false;
  }
  if (before.chat !== null) {
    return before.chat === after.chat;
  }
  return source === 'vk'
    ? before.title === after.title && before.admin === after.admin
    : before.kind === after.kind &&
        before.title === after.title &&
        before.requestNeeded === after.requestNeeded;
};
export const assertFollowingOwner = (before, after) => {
  if (
    !after ||
    typeof after.owner !== 'string' ||
    !/^[1-9]\d{0,19}$/u.test(after.owner)
  ) {
    throw backlinkFailure('provider-response');
  }
  if (before && before !== after.owner) {
    throw backlinkFailure('account-changed');
  }
};
