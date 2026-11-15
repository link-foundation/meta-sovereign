import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { loadSettings, optOutEntry } from './safety.js';
import {
  uncertainFriendAction,
  refuseFriendAction,
} from './vk-friends-records.js';
import { evidenceHash } from './vk-reengage-evidence.js';
import { wallItemIdentity, wallReceiptOwned } from './vk-wall-evidence.js';
import { positiveVkId } from './vk-friends-settings.js';
import { wallPauseReason } from './vk-wall-backoff.js';
import {
  wallPolicy,
  wallLedgerId,
  wallCommunityIds,
  wallLines,
  wallAttachments,
} from './vk-wall-settings.js';

const policyIdentity = (settings) => {
  const policy = { ...settings };
  if (!settings.randomAttachment) {
    // Retain the identity of legacy fixed-media receipts for manual recovery.
    delete policy.randomAttachment;
  }
  return evidenceHash(policy);
};

const resume = async (context, plan, item, previous, original) => {
  if (context.scheduled) {
    return 'manualReview';
  }
  if (
    previous.policyIdentity !== plan.policyIdentity ||
    previous.credentialIdentity !== plan.credentialIdentity
  ) {
    return 'changed';
  }
  try {
    await wallReceiptOwned(context, plan, item, original);
    for (const old of item.old.filter(
      (post) => !item.deleted.includes(post.id)
    )) {
      const current = await original.live.wallInvitePostState(
        item.userId,
        old.id,
        original.options
      );
      if ((await evidenceHash(current)) !== (await evidenceHash(old))) {
        return 'changed';
      }
    }
  } catch {
    return 'changed';
  }
  return 'eligible';
};
const currentReason = (context, plan, state, previous) => {
  if (uncertainFriendAction(previous)) {
    return 'unknown';
  }
  if (state.top.some((post) => post.date * 1000 > context.now())) {
    return 'futureHistory';
  }
  if (
    state.top.some(
      (post) =>
        post.fromId === plan.accountId &&
        post.text.includes(plan.settings.marker)
    )
  ) {
    return 'visible';
  }
  const at = Date.parse(previous?.attemptedAt ?? '');
  return Number.isFinite(at) &&
    (context.now() < at ||
      (previous.status === 'confirmed' &&
        context.now() - at < plan.settings.cooldownDays * 86400000))
    ? 'cooldown'
    : 'eligible';
};
const invitationDraft = (plan, state, previous) => {
  if (previous?.status === 'partial' && positiveVkId(previous.postId)) {
    return {
      resumed: true,
      guid: previous.guid,
      text: previous.text,
      attachments: previous.attachments,
      old: previous.old,
      deleted: previous.deleted,
      postId: previous.postId,
      baseline: previous.baseline,
    };
  }
  const restricted = wallCommunityIds(
    plan.settings.restrictedCommunities
  ).includes(state.community);
  const variants = wallLines(plan.settings.messages);
  const available = variants.filter((s) => s !== previous?.text);
  const choices = available.length ? available : variants;
  const media = restricted ? [] : wallAttachments(plan.settings.attachments);
  const selected =
    plan.settings.randomAttachment && media.length
      ? [media[Math.floor(Math.random() * media.length)]]
      : media;
  return {
    resumed: false,
    guid: globalThis.crypto.randomUUID(),
    text: restricted
      ? plan.settings.restrictedMessage
      : choices[Math.floor(Math.random() * choices.length)],
    attachments: [
      ...new Set([...(state.avatar ? [state.avatar] : []), ...selected]),
    ],
    old: state.owned,
    deleted: [],
    postId: null,
  };
};
const candidate = async (context, plan, community, original, safety) => {
  const paused = await wallPauseReason(context, plan.accountId, community);
  if (
    paused ||
    plan.settings.priorityIds.includes(community) ||
    optOutEntry(safety, { source: 'vk', chat: -community })
  ) {
    return {
      userId: community,
      action: 'post',
      reason: paused ?? 'protected',
      old: [],
      attachments: [],
    };
  }
  const state = await original.live.wallInviteState(community, {
    ...original.options,
    ...plan.settings,
  });
  if (state.accountId !== plan.accountId) {
    refuseFriendAction('VK account changed during wall review');
  }
  const previous = await context.store.get(
    wallLedgerId(plan.accountId, community)
  );
  const draft = invitationDraft(plan, state, previous);
  const item = {
    userId: community,
    action: 'post',
    ...draft,
    reviewedPostId: draft.postId,
    reviewedDeleted: [...draft.deleted],
    baseline: draft.resumed ? draft.baseline : await evidenceHash(state),
    previousFingerprint: await evidenceHash(previous),
  };
  if (item.attachments.length > 10) {
    refuseFriendAction(
      'Avatar and configured attachments exceed ten VK attachments'
    );
  }
  item.signature = await wallItemIdentity(plan, item);
  item.reason = item.resumed
    ? await resume(context, plan, item, previous, original)
    : currentReason(context, plan, state, previous);
  return item;
};
export const previewVkWall = async (context) => {
  if (context.isStopped()) {
    refuseFriendAction('Service stopped');
  }
  const settings = await wallPolicy.settings(context.store);
  const original = await context.provider();
  const source = await original.live.wallInviteSnapshot(original.options);
  const communities = wallCommunityIds(settings.communities);
  const plan = {
    id: wallPolicy.keys.plan,
    planId: globalThis.crypto.randomUUID(),
    status: 'review',
    createdAt: context.now(),
    accountId: source.accountId,
    friendCount: communities.length,
    settings,
    policyIdentity: await policyIdentity(settings),
    credentialIdentity: await evidenceHash(original.options.token),
    items: [],
  };
  const safety = await loadSettings(context.store);
  let count = 0;
  for (const community of communities) {
    const item = await candidate(context, plan, community, original, safety);
    if (item.reason === 'eligible' && count++ >= settings.limit) {
      item.reason = 'runLimit';
    }
    plan.items.push(item);
  }
  await saveAcknowledgedRecord(context.store, plan);
  return wallPolicy.read(context.store);
};
