import { parseTelegramLink } from '../follow/telegram-links.js';
import { followReadPolicy } from '../follow/read-policy.js';

export const followFailure = (code) => Object.assign(new Error(code), { code });
export const followText = (value) => String(value?.value ?? value ?? '');
export const followKind = (value) =>
  String(value?.className ?? '')
    .split('.')
    .pop();
const CHAT = /^-[1-9]\d{0,23}$/;
const USERNAME = /^[a-z][a-z\d_]{3,31}$/i;
export const followSelector = (value) => {
  if (typeof value !== 'string' || value.length > 2048) {
    return null;
  }
  const text = value.trim();
  if (CHAT.test(text)) {
    return { kind: 'id', chat: text };
  }
  const link = parseTelegramLink(text);
  if (link) {
    return link;
  }
  return USERNAME.test(text) ? parseTelegramLink(`@${text}`) : null;
};
export const followEntity = (entity) => {
  const kind = followKind(entity);
  const id = followText(entity?.id);
  if (
    !['Chat', 'Channel'].includes(kind) ||
    !/^[1-9]\d{0,19}$/.test(id) ||
    entity.deactivated ||
    entity.kicked
  ) {
    throw followFailure('target-unavailable');
  }
  return {
    chat: `${kind === 'Channel' ? '-100' : '-'}${id}`,
    kind,
    title: String(entity.title ?? '').slice(0, 256),
    username: String(entity.username ?? '').slice(0, 32),
    broadcast: entity.broadcast === true,
    megagroup: entity.megagroup === true,
    members:
      Number.isSafeInteger(entity.participantsCount) &&
      entity.participantsCount >= 0
        ? entity.participantsCount
        : null,
  };
};
export const followPeerChat = (peer) => {
  const field = {
    PeerChat: 'chatId',
    InputPeerChat: 'chatId',
    PeerChannel: 'channelId',
    InputPeerChannel: 'channelId',
  }[followKind(peer)];
  const id = field ? followText(peer[field]) : '';
  return /^[1-9]\d{0,19}$/.test(id)
    ? `${field === 'channelId' ? '-100' : '-'}${id}`
    : null;
};
export const followRequest = (body = {}) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw followFailure('bad-request');
  }
  const selector = followSelector(body.target);
  const operation = body.operation ?? 'join';
  const options = { mute: body.mute ?? null, archive: body.archive ?? null };
  if (
    !selector ||
    !['join', 'leave', 'preferences'].includes(operation) ||
    Object.values(options).some(
      (value) => value !== null && typeof value !== 'boolean'
    ) ||
    (operation === 'preferences' &&
      Object.values(options).every((value) => value === null)) ||
    (operation === 'leave' &&
      Object.values(options).some((value) => value !== null))
  ) {
    throw followFailure('bad-request');
  }
  return { selector, operation, options, retry: followReadPolicy(body) };
};
export const followSameTarget = (before, after) =>
  before.chat === after.chat &&
  before.kind === after.kind &&
  (before.chat !== null ||
    (before.title === after.title &&
      before.requestNeeded === after.requestNeeded));

export const followPhaseDone = (target, phase, plan) =>
  phase === 'membership'
    ? target.member === (plan.operation !== 'leave')
    : target[phase === 'mute' ? 'muted' : 'archived'] === plan.options[phase];
