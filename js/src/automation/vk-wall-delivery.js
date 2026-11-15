import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { vkEffectError } from './vk-effect-error.js';
import { equalFriendPolicy, refuseFriendAction } from './vk-friends-records.js';
import { positiveVkId } from './vk-friends-settings.js';
import { evidenceHash } from './vk-reengage-evidence.js';
import { wallLedgerId } from './vk-wall-settings.js';
import { retainWallBackoff } from './vk-wall-backoff.js';
import {
  wallCurrent,
  wallItemIdentity,
  wallReceiptOwned,
  wallJournalIdentity,
} from './vk-wall-evidence.js';

const checkJournal = async (state) => {
  if (
    (await wallJournalIdentity(state.context, state.plan, state.item)) !==
    state.expected
  ) {
    refuseFriendAction('VK invitation receipt changed; review again');
  }
};
const persist = async (state, status, error) => {
  await checkJournal(state);
  const row = await saveAcknowledgedRecord(state.context.store, {
    id: wallLedgerId(state.plan.accountId, state.item.userId),
    accountId: state.plan.accountId,
    planId: state.plan.planId,
    attemptedAt: state.attemptedAt,
    status,
    policyIdentity: state.plan.policyIdentity,
    credentialIdentity: state.plan.credentialIdentity,
    ...state.item,
    deleted: [...state.item.deleted],
    ...(error ? { error } : {}),
  });
  state.expected = await evidenceHash(row);
};
const guard = async (state, old) => {
  const { context, plan, item, original } = state;
  await wallCurrent(context, plan, item, original);
  if ((await wallItemIdentity(plan, item)) !== item.signature) {
    refuseFriendAction('The reviewed VK invitation changed');
  }
  const current = await original.live.wallInviteState(item.userId, {
    ...original.options,
    ...plan.settings,
  });
  if (current.accountId !== plan.accountId) {
    refuseFriendAction('VK wall account changed');
  }
  if (!item.postId) {
    if ((await evidenceHash(current)) !== item.baseline) {
      refuseFriendAction('VK wall or avatar changed; review again');
    }
  } else {
    await wallReceiptOwned(context, plan, item, original);
    if (old) {
      const post = await original.live.wallInvitePostState(
        item.userId,
        old.id,
        original.options
      );
      if (
        post.fromId !== plan.accountId ||
        !post.canDelete ||
        (await evidenceHash(post)) !== (await evidenceHash(old))
      ) {
        refuseFriendAction(
          'The reviewed old invitation is no longer owned or unchanged'
        );
      }
    }
  }
  await wallCurrent(context, plan, item, original);
  await checkJournal(state);
};
const issue = async (state, old) => {
  state.issued = false;
  const result = await state.original.live.wallInviteEffect(
    {
      community: state.item.userId,
      ...(old
        ? { action: 'delete', postId: old.id }
        : { action: 'post', ...state.item }),
    },
    state.original.options,
    async () => {
      await persist(state, 'pending');
      await guard(state, old);
      state.issued = true;
    }
  );
  if (
    !state.issued ||
    result?.confirmed !== true ||
    (old
      ? result.postId !== old.id
      : !positiveVkId(result.postId) ||
        state.item.old.some((post) => post.id === result.postId))
  ) {
    throw Object.assign(new Error('Missing admitted VK wall receipt'), {
      ambiguous: true,
    });
  }
  state.uncertain = true;
  if (old) {
    state.item.deleted.push(old.id);
  } else {
    state.item.postId = result.postId;
  }
  await persist(state, 'partial');
  state.uncertain = false;
  state.issued = false;
};
const failed = async (state, error) => {
  const unknown =
    state.uncertain ||
    error.ambiguous ||
    (state.issued && !error.vkCode && error.code !== 'review-required');
  const status = unknown
    ? 'unknown'
    : state.item.postId
      ? 'partial'
      : 'refused';
  const message = vkEffectError(error, state.original.options.token);
  try {
    await checkJournal(state);
    await retainWallBackoff(state, error);
    await persist(state, status, message);
  } catch {
    return {
      userId: state.item.userId,
      status: state.issued ? 'unknown' : 'refused',
    };
  }
  return {
    userId: state.item.userId,
    status: status === 'partial' ? 'refused' : status,
    outcome: status === 'partial' ? 'partial' : undefined,
    postId: state.item.postId,
    deleted: [...state.item.deleted],
  };
};
export const deliverVkWall = async (context, plan, reviewed, original) => {
  if (
    reviewed.postId !== reviewed.reviewedPostId ||
    !equalFriendPolicy(reviewed.deleted, reviewed.reviewedDeleted) ||
    (await wallItemIdentity(plan, reviewed)) !== reviewed.signature
  ) {
    // Keep the previous receipt intact when a saved review was changed.
    return { userId: reviewed.userId, status: 'refused' };
  }
  const item = { ...reviewed, deleted: [...reviewed.deleted] };
  const state = {
    context,
    plan,
    item,
    original,
    expected: item.previousFingerprint,
    issued: false,
    uncertain: false,
    attemptedAt: new Date(context.now()).toISOString(),
  };
  try {
    if (context.scheduled && item.resumed) {
      refuseFriendAction('Review partial invitation replacement manually');
    }
    await guard(state);
    if (!item.postId) {
      await issue(state);
    }
    for (const old of item.old.filter(
      (post) => !item.deleted.includes(post.id)
    )) {
      await context.sleep(5000, context.signal);
      await issue(state, old);
    }
    await persist(state, 'confirmed');
    return {
      userId: item.userId,
      status: 'confirmed',
      outcome: 'delivered',
      postId: item.postId,
      deleted: item.deleted,
    };
  } catch (error) {
    return failed(state, error);
  }
};
