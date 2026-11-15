import { equalFriendPolicy } from './vk-friends-records.js';
import { vkSequenceReceipt } from './vk-sequence-receipt.js';

export const reengageDraft = (kind, item, index) => {
  const step = item.steps[index];
  return {
    source: 'vk',
    chat: String(item.userId),
    text: step.text,
    ...(step.sticker ? { sticker: { id: String(step.sticker) } } : {}),
    ...(step.audio
      ? {
          attachments: [
            { kind: 'audio', providerId: step.audio, title: step.audio },
          ],
        }
      : {}),
    ...(step.attachments?.length
      ? {
          attachments: step.attachments.map((id) => ({
            kind: id.match(/^[a-z]+/u)[0],
            providerId: id,
            title: id,
          })),
        }
      : {}),
    sequence: { policy: kind, index: index + 1, signature: item.signature },
  };
};

export const matchesReengageReceipt = (
  record,
  kind,
  item,
  index,
  messageId
) => {
  const draft = reengageDraft(kind, item, index);
  const receipt = vkSequenceReceipt({ via: 'api', result: messageId }, draft);
  return Boolean(
    receipt &&
    record?.status === 'sent' &&
    ['source', 'chat', 'text', 'sticker', 'attachments', 'sequence'].every(
      (key) => equalFriendPolicy(record[key], draft[key])
    ) &&
    equalFriendPolicy(record.vkReceipt, receipt)
  );
};
