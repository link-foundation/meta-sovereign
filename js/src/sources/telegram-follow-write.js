import { randomUUID } from 'node:crypto';
import { connect, runIn } from './telegram-stickers.js';
import { greetingStickerOwner } from './telegram-greeting-stickers-cache.js';
import { resolveFollowTarget } from './telegram-follow-target.js';
import {
  followFailure,
  followKind,
  followSameTarget,
  followText,
  followPhaseDone,
} from './telegram-follow-shape.js';
import {
  telegramJoinedReceipt,
  telegramOperationUpdates,
  traceTelegramMembership,
} from './telegram-membership-receipt.js';
import { journalFollowPhase } from './telegram-follow-journal.js';
import { MUTE_FOREVER } from './telegram-dialogs.js';
import { followReadFailure } from './telegram-follow-runtime.js';

const explicitFailure = (error, issued) => {
  if (!issued) {
    return { status: 'failed', code: followReadFailure(error).code };
  }
  const rpc = error?.errorMessage;
  if (rpc === 'INVITE_REQUEST_SENT') {
    return { status: 'pending', code: 'approval-pending' };
  }
  if (
    !rpc ||
    /TIMEOUT|INTERNAL|RPC_CALL_FAIL|WORKER_BUSY/.test(rpc) ||
    Number(error.code) >= 500
  ) {
    return { status: 'unknown', code: 'outcome-unknown' };
  }
  if (/^FLOOD_(?:PREMIUM_)?WAIT_\d+$/.test(rpc)) {
    return { status: 'failed', code: 'flood-wait' };
  }
  const codes = {
    INVITE_HASH_EXPIRED: 'invite-expired',
    INVITE_HASH_INVALID: 'invite-invalid',
    CHANNELS_TOO_MUCH: 'too-many-chats',
    USERS_TOO_MUCH: 'chat-full',
    CHAT_ADMIN_REQUIRED: 'not-admin',
    CHANNEL_PRIVATE: 'no-access',
    USER_CREATOR: 'owner-cannot-leave',
    USER_ALREADY_PARTICIPANT: 'membership-changed',
  };
  return { status: 'failed', code: codes[rpc] ?? 'provider-refused' };
};
const leaveAcknowledged = (answer, target, owner) => {
  const updates = telegramOperationUpdates(answer);
  const id = target.chat.slice(target.kind === 'Channel' ? 4 : 1);
  return updates &&
    (updates.chats.some(
      (chat) =>
        followKind(chat) === target.kind &&
        followText(chat.id) === id &&
        chat.left === true
    ) ||
      updates.updates.some(
        (u) =>
          (target.kind === 'Channel' &&
            followKind(u) === 'UpdateChannel' &&
            followText(u.channelId) === id) ||
          (target.kind === 'Chat' &&
            followKind(u) === 'UpdateChatParticipantDelete' &&
            followText(u.chatId) === id &&
            followText(u.userId) === owner)
      ))
    ? updates
    : null;
};
const requestOf = (c, fresh, plan, phase) => {
  const { Api } = c;
  const peer = fresh.peer;
  if (phase === 'membership' && plan.operation === 'join') {
    if (!fresh.joinable) {
      throw followFailure('invitation-required');
    }
    return plan.selector.kind === 'invite'
      ? new Api.messages.ImportChatInvite({ hash: plan.selector.invite })
      : new Api.channels.JoinChannel({ channel: peer });
  }
  if (!peer || !fresh.target.member) {
    throw followFailure('not-member');
  }
  if (phase === 'membership') {
    return fresh.target.kind === 'Channel'
      ? new Api.channels.LeaveChannel({ channel: peer })
      : new Api.messages.DeleteChatUser({
          chatId: c.helpers.returnBigInt(fresh.target.chat.slice(1)),
          userId: new Api.InputUserSelf(),
          revokeHistory: false,
        });
  }
  return phase === 'mute'
    ? new Api.account.UpdateNotifySettings({
        peer: new Api.InputNotifyPeer({ peer }),
        settings: new Api.InputPeerNotifySettings({
          muteUntil: plan.options.mute ? MUTE_FOREVER : 0,
        }),
      })
    : new Api.folders.EditPeerFolders({
        folderPeers: [
          new Api.InputFolderPeer({
            peer,
            folderId: plan.options.archive ? 1 : 0,
          }),
        ],
      });
};
const receiptOf = (answer, plan, phase, target) => {
  if (phase === 'membership' && plan.operation === 'join') {
    const receipt = telegramJoinedReceipt(answer, plan.target.chat);
    const correctKind =
      receipt.ok &&
      receipt.updates.chats.some(
        (chat) =>
          followKind(chat) === plan.target.kind &&
          `${plan.target.kind === 'Channel' ? '-100' : '-'}${followText(chat.id)}` ===
            receipt.chat
      );
    return receipt.ok && correctKind
      ? { status: 'confirmed', chat: receipt.chat, updates: receipt.updates }
      : {
          status:
            receipt.code === 'join-web-view-required'
              ? 'unsupported'
              : 'unknown',
          code: receipt.code ?? 'outcome-unknown',
        };
  }
  const updates =
    phase === 'mute'
      ? null
      : phase === 'membership'
        ? leaveAcknowledged(answer, target, plan.owner)
        : telegramOperationUpdates(answer);
  return (phase === 'mute' ? answer === true : Boolean(updates))
    ? { status: 'confirmed', chat: target.chat, updates }
    : { status: 'unknown', code: 'outcome-unknown' };
};
const prepare = async (env, context, plan, phase, cancelled, now) => {
  const c = await connect(env, context.userClient);
  if (!c) {
    throw followFailure('user-account-required');
  }
  if (cancelled()) {
    throw followFailure(cancelled());
  }
  // This phase owns the serial account queue; do not enqueue a nested read.
  if ((await greetingStickerOwner({}, c)) !== plan.owner) {
    throw followFailure('account-changed');
  }
  const fresh = await resolveFollowTarget(c, plan.selector, now);
  if (!followSameTarget(plan.target, fresh.target)) {
    throw followFailure('target-changed');
  }
  if (followPhaseDone(fresh.target, phase, plan)) {
    return {
      result: {
        status: 'skipped',
        code: 'already-applied',
        chat: fresh.target.chat,
      },
    };
  }
  requestOf(c, fresh, plan, phase);
  return {
    write: async () => {
      let issued = false;
      try {
        if (cancelled()) {
          throw followFailure(cancelled());
        }
        const latest = await resolveFollowTarget(c, plan.selector, now);
        if (!followSameTarget(plan.target, latest.target)) {
          throw followFailure('target-changed');
        }
        if (
          (await greetingStickerOwner({}, c)) !== plan.owner ||
          (await context.userClient()) !== c.client
        ) {
          throw followFailure('account-changed');
        }
        if (cancelled()) {
          throw followFailure(cancelled());
        }
        if (followPhaseDone(latest.target, phase, plan)) {
          return {
            status: 'skipped',
            code: 'already-applied',
            chat: latest.target.chat,
          };
        }
        const request = requestOf(c, latest, plan, phase);
        issued = true;
        const answer = await c.client.invoke(request, undefined, {
          maxRetryCount: 0,
          floodSleepThreshold: 0,
        });
        const receipt = receiptOf(answer, plan, phase, latest.target);
        traceTelegramMembership(env, `follow-${phase}`, {
          ok: receipt.status === 'confirmed',
          code: receipt.code,
        });
        if (receipt.updates) {
          try {
            await context.apply(c.client, receipt.updates);
          } catch {
            env.log?.({
              level: 'debug',
              event: 'telegram_follow_projection_failed',
            });
          }
        }
        const { updates: _updates, ...result } = receipt;
        return result;
      } catch (error) {
        return explicitFailure(error, issued);
      }
    },
  };
};
export const writeFollowPhase = async (
  env,
  context,
  plan,
  phase,
  cancelled,
  now
) => {
  let actual;
  const queued = await runIn(env, `follow:write:${randomUUID()}`, () => {
    actual = journalFollowPhase(
      env,
      plan,
      phase,
      async () => {
        try {
          return await prepare(env, context, plan, phase, cancelled, now);
        } catch (error) {
          return { result: explicitFailure(error, false) };
        }
      },
      now
    ).catch(() => ({ status: 'failed', code: 'storage-unavailable' }));
    return actual;
  }).catch(() => ({ status: 'unknown', code: 'outcome-unknown' }));
  // Keep the actual request owned after a queue deadline, including its receipt.
  return actual ? await actual : queued;
};
