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
