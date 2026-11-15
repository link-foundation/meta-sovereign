import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';

export const peerTriggerId = (automation, message) =>
  `automation-peer-state:${encodeURIComponent(JSON.stringify([automation.id, message.source, String(message.chat)]))}`;

export const triggerReceipt = async (store, automation, message, run, at) => {
  const id = peerTriggerId(automation, message);
  const previous = await store.get(id);
  const timestamp = Date.parse(message.timestamp);
  const last = previous?.messageTime ?? 0;
  if (
    timestamp < last ||
    (timestamp === last && previous?.messageIds?.includes(message.id))
  ) {
    return null;
  }
  // At one provider timestamp, retain a bounded set rather than comparing
  // external IDs lexically. Refuse saturation instead of forgetting duplicates.
  const messageIds =
    timestamp === last ? [...(previous?.messageIds ?? [])] : [];
  if (messageIds.length >= 128) {
    throw Object.assign(new Error('Too many peer updates at one timestamp'), {
      code: 'trigger-window-full',
    });
  }
  const result = await run();
  await saveAcknowledgedRecord(store, {
    id,
    tokens: ['automation-peer-state', message.source],
    automation: automation.id,
    source: message.source,
    chat: String(message.chat),
    lastTriggered: at,
    messageTime: timestamp,
    messageIds: [...messageIds, message.id],
    status: 'processed',
    drafts: result?.queued?.length ?? 0,
  });
  return result;
};
