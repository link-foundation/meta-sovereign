import { messageTime } from './message-time.js';
import { greetingDestinationReason } from '../greetings/plan.js';

// The two pinned VK triggers ask the same whole question in different forms.
// A bounded independent parser keeps quoted/additional questions out.
export const wholeVkQuestion = (body) => {
  if (typeof body !== 'string' || body.length > 256) {
    return null;
  }
  const text = body.normalize('NFKC').toLowerCase();
  const end = text.indexOf('?');
  if (end < 0 || /[\p{L}\p{N}]/u.test(text.slice(end))) {
    return null;
  }
  return (text.slice(0, end).match(/[\p{L}\p{N}]+/gu) ?? []).join(' ');
};

export const identityQuestionForm = (body) => {
  const question = wholeVkQuestion(body)?.replace(/^а /u, '');
  if (question === 'кто ты' || question === 'ты кто') {
    return 'informal';
  }
  return question === 'кто вы' || question === 'вы кто' ? 'formal' : null;
};

export const incomingPersonalVk = (message, isSelf) =>
  Boolean(
    message?.id?.startsWith('msg:') &&
    message.source === 'vk' &&
    !greetingDestinationReason({ ...message, network: message.source }) &&
    !message.deleted &&
    !message.service &&
    !message.outgoing &&
    !message.out &&
    !isSelf(message.sender)
  );

// Derive the reference's per-peer distance preference from durable history.
// No preview mutates state; deletion/editing changes the derived evidence.
export const identityAddressPreference = (messages, isSelf) => {
  let found = null;
  let ambiguous = false;
  for (const message of messages) {
    const form = identityQuestionForm(message.body);
    const at = messageTime(message.timestamp);
    if (!form || !Number.isFinite(at) || !incomingPersonalVk(message, isSelf)) {
      continue;
    }
    if (!found || at > messageTime(found.at)) {
      found = {
        form,
        at: new Date(at).toISOString(),
        evidence: [message.id],
        basis: 'identity',
      };
      ambiguous = false;
    } else if (at === messageTime(found.at) && form !== found.form) {
      ambiguous = true;
    }
  }
  return ambiguous ? null : found;
};
