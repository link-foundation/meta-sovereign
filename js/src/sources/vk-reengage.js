import { positiveVkId } from '../automation/vk-friends-settings.js';
import { vkAudioIdentity } from '../automation/vk-reengage-settings.js';
import { vkNativeAttachments } from './vk-native-attachment.js';

export const createVkReengage = ({ once, greetings }) => ({
  reengageSnapshot: greetings.greetSnapshot,
  reengageState: (userId, options) =>
    greetings.greetState(userId, { ...options, personalSequence: true }),
  async reengageEffect(item, options, beforeIssue) {
    if (item.audio && !vkAudioIdentity(item.audio)) {
      throw new Error('Invalid VK audio attachment identity');
    }
    const attachments = vkNativeAttachments(item.attachments);
    const id = await once(
      'messages.send',
      {
        peer_id: item.userId,
        random_id: item.randomId,
        ...(item.sticker
          ? { sticker_id: item.sticker }
          : item.audio
            ? { attachment: item.audio }
            : {
                message: item.text,
                ...(attachments.length
                  ? { attachment: attachments.join(',') }
                  : {}),
              }),
      },
      options.token,
      { write: true, retries: 0 },
      beforeIssue
    );
    if (!positiveVkId(id)) {
      throw Object.assign(
        new Error('VK did not acknowledge the sequence step'),
        { ambiguous: true, code: 'unconfirmed' }
      );
    }
    return { messageId: id };
  },
});
