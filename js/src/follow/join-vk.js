import { createFollowVkCalls } from './vk-calls.js';
import {
  backlinkError,
  backlinkFailure,
  backlinkUrl,
} from './backlink-shape.js';
import { followJoinState, journalFollowJoin } from './join-journal.js';

const localId = (value) =>
  Number.isSafeInteger(value) && value >= 1 && value <= 147483647;
const checkedPreview = (answer) => {
  const preview = answer?.preview;
  if (
    !preview ||
    typeof preview.title !== 'string' ||
    !Number.isSafeInteger(preview.admin_id) ||
    preview.admin_id < 0 ||
    typeof preview.is_member !== 'boolean' ||
    (preview.local_id !== undefined && !localId(preview.local_id))
  ) {
    throw backlinkFailure('provider-response');
  }
  return {
    chat: localId(preview.local_id)
      ? String(2000000000 + preview.local_id)
      : null,
    title: preview.title.slice(0, 256),
    admin: String(preview.admin_id),
    member: preview.is_member,
  };
};
export const sameFollowJoin = (before, after) =>
  before.chat === null
    ? before.title === after.title && before.admin === after.admin
    : before.chat === after.chat;

export const createFollowVkJoining = async (options) => {
  const { call, identity } = await createFollowVkCalls(options);
  const preview = async (url) => {
    if (backlinkUrl(url).source !== 'vk') {
      throw backlinkFailure('bad-request');
    }
    const owner = await identity();
    const target = checkedPreview(
      await call('messages.getChatPreview', { link: url })
    );
    await identity();
    const review = { source: 'vk', url, owner, target };
    return {
      ...review,
      phases: [
        {
          phase: 'membership',
          ...(target.member
            ? { status: 'skipped' }
            : await followJoinState(options.store, review)),
        },
      ],
    };
  };
  const apply = async (review, { cancelled, read }) => {
    const check = async () => {
      const fresh = await read(() => preview(review.url));
      if (fresh.owner !== review.owner) {
        throw backlinkFailure('account-changed');
      }
      if (!sameFollowJoin(review.target, fresh.target)) {
        throw backlinkFailure('target-changed');
      }
      if (cancelled()) {
        throw backlinkFailure('cancelled');
      }
      return fresh;
    };
    const fresh = await check();
    if (fresh.target.member) {
      return {
        ok: true,
        results: [
          { phase: 'membership', status: 'skipped', chat: fresh.target.chat },
        ],
      };
    }
    const result = await journalFollowJoin(options.store, review, async () => {
      let issued = false;
      let acknowledged = false;
      let chat;
      try {
        const latest = await check();
        if (latest.target.member) {
          return { status: 'skipped', chat: latest.target.chat };
        }
        // Identity and cancellation are checked after the final preview.
        if ((await read(identity)) !== review.owner) {
          throw backlinkFailure('account-changed');
        }
        if (cancelled()) {
          throw backlinkFailure('cancelled');
        }
        issued = true;
        const answer = await call(
          'messages.joinChatByInviteLink',
          { link: review.url },
          true,
          { cancelled }
        );
        acknowledged = true;
        if (!localId(answer?.chat_id)) {
          throw backlinkFailure('outcome-unknown');
        }
        chat = String(2000000000 + answer.chat_id);
        const after = await read(() => preview(review.url));
        if (
          !after.target.member ||
          after.target.chat !== chat ||
          !sameFollowJoin(review.target, after.target)
        ) {
          throw backlinkFailure('outcome-unknown');
        }
        return { status: 'confirmed', chat };
      } catch (error) {
        const failure = backlinkError(error, { write: issued });
        return {
          status:
            !issued || (!acknowledged && failure.providerCode !== undefined)
              ? 'failed'
              : 'unknown',
          ...failure,
          ...(chat ? { chat } : {}),
        };
      }
    });
    return {
      ok: ['confirmed', 'skipped'].includes(result.status),
      results: [{ phase: 'membership', ...result }],
    };
  };
  return { preview, apply };
};
