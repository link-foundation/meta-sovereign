import { scanChatUsers } from './telegram-chat-users-scan.js';
import { greetingRecipient } from './telegram-group-greeting-shape.js';

export const scanGreetingParticipants = async (r) => {
  await scanChatUsers(r);
  r.job.phase = 'checking-business';
  r.job.businessChecked = 0;
  await r.publish();
  for (const [id, user] of r.collection.users) {
    if (r.cancelled()) {
      break;
    }
    try {
      const entity = await r.c.client.getEntity(r.c.helpers.returnBigInt(id));
      const checked = await greetingRecipient(
        r.env,
        r.c,
        entity,
        r.job.meId,
        r.job.id
      );
      // A matching identity is required even if a stale cache returned another user.
      if (checked.id === id) {
        Object.assign(user, checked);
      }
    } catch {
      user.businessChecked = false;
    }
    r.job.businessChecked += 1;
    if (r.job.businessChecked % 100 === 0) {
      await r.publish();
    }
  }
};
