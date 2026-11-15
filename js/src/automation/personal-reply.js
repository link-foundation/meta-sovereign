import { greetingDestinationReason } from '../greetings/plan.js';

import { messageTime } from '../crm/message-time.js';

const at = (message) => messageTime(message.timestamp);
export const latestReplyMessage = (messages) => {
  let latest = null;
  let ambiguous = false;
  for (const message of messages) {
    if (!Number.isFinite(at(message))) {
      return null;
    }
    if (!latest || at(message) > at(latest)) {
      latest = message;
      ambiguous = false;
    } else if (at(message) === at(latest) && message.id !== latest.id) {
      ambiguous = true;
    }
  }
  return ambiguous ? null : latest;
};

export const replyFingerprint = (message) =>
  JSON.stringify([
    message.id,
    message.source,
    String(message.chat),
    message.sender,
    message.body,
    message.sticker?.id,
    message.timestamp,
    message.outgoing,
    message.out,
    message.deleted,
    message.service,
    message.chatType,
  ]);

export const personalReplyDraft = (
  automation,
  candidate,
  draft,
  isSelf,
  key,
  reasonFor
) => {
  const message = latestReplyMessage(candidate.messages);
  const reason =
    reasonFor(message, isSelf) ||
    (candidate.messages.some(
      (m) =>
        m.chatType && greetingDestinationReason({ ...m, network: m.source })
    ) &&
      'personal-chat-required');
  return reason
    ? { reason }
    : {
        draft: {
          ...draft,
          [key]: {
            message: message.id,
            fingerprint: replyFingerprint(message),
            policy: JSON.stringify(automation.action),
            sticker: draft.sticker?.id ?? null,
          },
        },
      };
};

export const replyVariantIndex = (id, length) => {
  let hash = 0;
  for (const char of id) {
    hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  }
  return hash % length;
};

// Each personal reply starts with the same reversible private-chat policy.
export const personalReplyPreset = (id, name, description, templates) => ({
  id,
  preset: id,
  name,
  description,
  enabled: false,
  triggers: [{ kind: 'incoming', recognizer: id }, { kind: 'chat-menu' }],
  conditions: {
    mutual: false,
    lastFrom: 'contact',
    networks: ['vk'],
    cooldownDays: 1,
  },
  action: { kind: `reply-${id}`, templates },
});
