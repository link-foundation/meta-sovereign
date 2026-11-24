import { equalFriendPolicy, refuseFriendAction } from './vk-friends-records.js';
import { evidenceHash } from './vk-reengage-evidence.js';
import { loadSettings, optOutEntry, quietMsLeft } from './safety.js';
import { wallPolicy, wallLedgerId } from './vk-wall-settings.js';
import { wallPauseReason } from './vk-wall-backoff.js';
import { requireVkReviewLifetime } from './vk-review-lifetime.js';

export const wallCurrent = async (context, plan, item, original) => {
  requireVkReviewLifetime(
    context,
    plan,
    'VK wall review stopped, expired or changed'
  );
  if (
    !equalFriendPolicy(
      await wallPolicy.settings(context.store),
      plan.settings
    ) ||
    (await context.optionsFor())?.token !== original.options.token
  ) {
    refuseFriendAction('VK wall review stopped, expired or changed');
  }
  const safety = await loadSettings(context.store);
  if (
    (await wallPauseReason(context, plan.accountId, item.userId)) ||
    optOutEntry(safety, { source: 'vk', chat: -item.userId }) ||
    (context.scheduled && quietMsLeft(context.now(), safety))
  ) {
    refuseFriendAction('VK wall consent or quiet hours changed');
  }
};
export const wallItemIdentity = (plan, item) =>
  evidenceHash({
    account: plan.accountId,
    planId: plan.planId,
    createdAt: plan.createdAt,
    policy: plan.settings,
    credential: plan.credentialIdentity,
    community: item.userId,
    guid: item.guid,
    text: item.text,
    attachments: item.attachments,
    baseline: item.baseline,
    old: item.old,
    reviewedPostId: item.reviewedPostId,
    reviewedDeleted: item.reviewedDeleted,
    reviewedAbsent: item.reviewedAbsent ?? [],
    resumed: item.resumed,
    previousFingerprint: item.previousFingerprint,
  });
export const wallReceiptOwned = async (context, plan, item, original) => {
  const post = await original.live.wallInvitePostState(
    item.userId,
    item.postId,
    original.options
  );
  if (post?.fromId !== plan.accountId || post.text !== item.text) {
    refuseFriendAction('The acknowledged invitation post changed');
  }
  const identities = post.attachments
    .filter((a) => ['photo', 'audio', 'video', 'doc'].includes(a.type))
    .map((a) => {
      const v = a[a.type];
      return `${a.type}${v?.owner_id}_${v?.id}`;
    });
  const expected = item.attachments.map((id) =>
    id.split('_').slice(0, 2).join('_')
  );
  if (!equalFriendPolicy(identities, expected)) {
    refuseFriendAction('The acknowledged invitation attachments changed');
  }
};
export const wallJournalIdentity = async (context, plan, item) =>
  evidenceHash(
    await context.store.get(wallLedgerId(plan.accountId, item.userId))
  );
