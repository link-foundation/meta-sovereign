import { refuseFriendAction } from './vk-friends-records.js';

/** Recheck the same finite review lifetime before and after asynchronous reads. */
export const requireVkReviewLifetime = (context, plan, message) => {
  if (
    context.isStopped() ||
    context.now() < plan.createdAt ||
    context.now() - plan.createdAt > 300000
  ) {
    refuseFriendAction(message);
  }
};
