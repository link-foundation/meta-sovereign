import {
  invokeTelegramWrite,
  telegramLeftUpdates,
  telegramOperationUpdates,
  telegramWriteFailure,
  traceTelegramMembership,
} from './telegram-membership-receipt.js';
import { failureOf } from './telegram-stickers.js';

const failure = telegramWriteFailure(
  failureOf({
    CHAT_ADMIN_REQUIRED: 'not-admin',
    USER_CREATOR: 'owner-cannot-leave',
    CHANNEL_PRIVATE: 'no-access',
    USER_NOT_PARTICIPANT: 'not-member',
    FLOOD_WAIT: 'flood',
  })
);
const unknown = () =>
  Object.assign(new Error('outcome-unknown'), { code: 'outcome-unknown' });

const applyConfirmed = async (env, apply, client, answer) => {
  try {
    await apply(client, answer);
  } catch {
    env.log?.({ level: 'debug', event: 'telegram_removal_projection_failed' });
  }
};
const deleteHistory = async (env, c, peer, { action, revoke }) => {
  for (let round = 0; round < 100; round += 1) {
    const answer = await invokeTelegramWrite(
      c.client,
      new c.Api.messages.DeleteHistory({
        peer,
        maxId: 0,
        justClear: action === 'clear',
        revoke,
      })
    );
    if (
      !['pts', 'ptsCount', 'offset'].every(
        (key) => Number.isInteger(answer?.[key]) && answer[key] >= 0
      )
    ) {
      throw unknown();
    }
    env.catchUp?.observeResult(answer);
    if (answer.offset === 0) {
      return;
    }
  }
  throw Object.assign(new Error('history-incomplete'), {
    code: 'history-incomplete',
  });
};
const channelRequest = async (env, c, request) => {
  const { Api } = c;
  const { action, chat, peer } = request;
  if (action === 'destroy') {
    return new Api.channels.DeleteChannel({ channel: peer });
  }
  if (action === 'leave') {
    return new Api.channels.LeaveChannel({ channel: peer });
  }
  const read = (await env.store.get(`read:telegram:${chat}`)) ?? {};
  const prefix = `msg:telegram:${chat}:`;
  const stored = await env.store.query((link) => link.id.startsWith(prefix));
  const maxId = stored.reduce(
    (max, link) => Math.max(max, Number(link.id.slice(prefix.length)) || 0),
    Number(read.unreadTopId) || 0
  );
  return new Api.channels.DeleteHistory({
    channel: peer,
    maxId,
    forEveryone: false,
  });
};
const removeChannel = async (env, c, request, apply) => {
  const answer = await invokeTelegramWrite(
    c.client,
    await channelRequest(env, c, request)
  );
  const updates =
    request.action === 'clear'
      ? telegramOperationUpdates(answer)
      : telegramLeftUpdates(answer, request.chat);
  if (!updates) {
    throw unknown();
  }
  await applyConfirmed(env, apply, c.client, updates);
};
const leaveGroup = async (env, c, request, apply) => {
  const me = await c.client.getMe();
  const owner = String(me?.id?.value ?? me?.id ?? '');
  if (!/^[1-9]\d{0,19}$/.test(owner) || me.bot || me.deleted) {
    throw Object.assign(new Error('user-account-required'), {
      code: 'user-account-required',
    });
  }
  const answer = await invokeTelegramWrite(
    c.client,
    new c.Api.messages.DeleteChatUser({
      chatId: c.helpers.returnBigInt(request.chat.slice(1)),
      userId: new c.Api.InputUserSelf(),
      revokeHistory: false,
    })
  );
  const updates = telegramLeftUpdates(answer, request.chat, owner);
  if (!updates) {
    throw unknown();
  }
  await applyConfirmed(env, apply, c.client, updates);
};

/** Preserve a confirmed leave even when the existing menu's later history
 * cleanup is uncertain. Local removal is allowed only when all steps finish. */
export const requestChatRemoval = async (env, c, request, apply) => {
  let membership;
  try {
    const { chat, action } = request;
    if (chat.startsWith('-100')) {
      await removeChannel(env, c, request, apply);
    } else if (action === 'destroy') {
      const answer = await invokeTelegramWrite(
        c.client,
        new c.Api.messages.DeleteChat({
          chatId: c.helpers.returnBigInt(chat.slice(1)),
        })
      );
      if (answer !== true) {
        throw unknown();
      }
    } else {
      if (action === 'leave') {
        await leaveGroup(env, c, request, apply);
        membership = 'confirmed';
      }
      await deleteHistory(env, c, request.peer, {
        action,
        revoke: !chat.startsWith('-') && request.revoke === true,
      });
    }
    traceTelegramMembership(env, `chat-${action}`, { ok: true });
    return { ok: true };
  } catch (error) {
    const result = ['history-incomplete', 'user-account-required'].includes(
      error?.code
    )
      ? { ok: false, code: error.code }
      : failure(error);
    traceTelegramMembership(env, `chat-${request.action}`, result);
    return membership
      ? {
          ...result,
          membership,
          code:
            result.code === 'outcome-unknown'
              ? 'history-outcome-unknown'
              : result.code,
        }
      : result;
  }
};
