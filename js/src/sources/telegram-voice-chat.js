/**
 * Voice chats, video chats and live streams of groups and channels, as
 * Telegram Desktop and the web clients have them (R-Y188; learned, never
 * copied). The page never joins or unmutes by itself: every write below
 * answers one click.
 * - `callInfo({ chat })` — the chat's active call, if any (the full chat's
 *   `call`, then phone.getGroupCall) → `{ ok, call }`, `call` null or
 *   `{ id, accessHash, title, count, recent (up to three { id, name }), live (a live stream), scheduleDate
 *   (seconds), subscribed, joinMuted, canStartVideo, canChangeJoinMuted,
 *   defaultJoinAs }`;
 * - `callOpen({ id, accessHash })` — the call and its first participants
 *   (phone.getGroupCall) → `{ ok, call, participants, next, count }`;
 * - `callParticipants({ id, accessHash, offset })` — a further page
 *   (phone.getGroupParticipants);
 * - `callNotify({ id, accessHash, subscribed })` — "Notify me" for a
 *   scheduled call (phone.toggleGroupCallStartSubscription);
 * - `callJoinAs({ chat })` — who may join as (phone.getGroupCallJoinAs);
 * - `callJoin({ id, accessHash, params, joinAs? })` — joins muted
 *   (phone.joinGroupCall) with the browser's join params JSON; answers
 *   `{ ok, connection (Telegram's answer JSON), source }`;
 * - `callLeave({ id, accessHash, source })` — phone.leaveGroupCall;
 * - `callSelf({ id, accessHash, muted, raiseHand?, joinAs? })` — our own
 *   mute or raised hand (phone.editGroupCallParticipant, self only).
 * Telegram's errors become codes the page shows as text.
 */

import { connected, runIn, failureOf } from './telegram-stickers.js';
import { inputOf } from './telegram-send-as-client.js';

const CODES = {
  GROUPCALL_INVALID: 'gone',
  GROUPCALL_FORBIDDEN: 'forbidden',
  GROUPCALL_JOIN_MISSING: 'not-joined',
  PARTICIPANT_JOIN_MISSING: 'not-joined',
  JOIN_AS_PEER_INVALID: 'bad-join-as',
  CHANNEL_PRIVATE: 'no-access',
  CHAT_ID_INVALID: 'no-access',
  PEER_ID_INVALID: 'no-access',
  FLOOD_WAIT: 'flood',
};

const failure = failureOf(CODES);
const bad = () => ({ ok: false, error: 'bad request', code: 'failed' });

const DIGITS = /^\d{1,20}$/;
const CHAT = /^-\d{1,20}$/;
const JOIN_AS = /^-?\d{1,20}$/;
const PAGE = 30;
const text = (value) => String(value ?? '');

/** Whether the body names a call: its id and access hash as digits. */
export const validCall = (body) =>
  DIGITS.test(text(body?.id)) && /^-?\d{1,20}$/.test(text(body?.accessHash));

export const validChat = (body) => CHAT.test(text(body?.chat));

export const validJoinAs = (value) =>
  value === undefined || (typeof value === 'string' && JOIN_AS.test(value));

/** The join params JSON the page built: an object with a numeric ssrc. */
export const validParams = (value) => {
  if (typeof value !== 'string' || value.length > 20_000) {
    return false;
  }
  try {
    const parsed = JSON.parse(value);
    return (
      Boolean(parsed) &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      Number.isFinite(parsed.ssrc) &&
      typeof parsed.ufrag === 'string' &&
      typeof parsed.pwd === 'string' &&
      Array.isArray(parsed.fingerprints)
    );
  } catch {
    return false;
  }
};

/** The marked chat id of a Peer. */
export const peerKey = (peer) => {
  switch (peer?.className) {
    case 'PeerUser':
      return text(peer.userId);
    case 'PeerChat':
      return `-${text(peer.chatId)}`;
    case 'PeerChannel':
      return `-100${text(peer.channelId)}`;
    default:
      return null;
  }
};

const nameOf = (entity) =>
  entity?.title ??
  ([entity?.firstName, entity?.lastName].filter(Boolean).join(' ') ||
    entity?.username ||
    '');

/** A GroupCall as the page reads it; null when it is over. */
export const shapeCall = (call) => {
  if (!call || call.className !== 'GroupCall') {
    return null;
  }
  const schedule = Number(call.scheduleDate) || 0;
  const joinAs = call.defaultSendAs ? peerKey(call.defaultSendAs) : null;
  return {
    id: text(call.id),
    accessHash: text(call.accessHash),
    title: text(call.title),
    count: Number(call.participantsCount) || 0,
    live: Boolean(call.rtmpStream),
    ...(schedule > 0 ? { scheduleDate: schedule } : {}),
    subscribed: Boolean(call.scheduleStartSubscribed),
    joinMuted: Boolean(call.joinMuted),
    canChangeJoinMuted: Boolean(call.canChangeJoinMuted),
    canStartVideo: Boolean(call.canStartVideo),
    creator: Boolean(call.creator),
    ...(joinAs ? { defaultJoinAs: joinAs } : {}),
  };
};

const entityOf = (answer, peer) => {
  const key = peer?.userId ?? peer?.channelId ?? peer?.chatId;
  const list = peer?.userId ? answer.users : answer.chats;
  return (list ?? []).find((e) => text(e.id) === text(key));
};

/**
 * A GroupCallParticipant as the page reads it: who, the marks (muted,
 * raised hand, video, presentation, self), when they last spoke
 * (`activeDate`, seconds: the page decides who is speaking now) and their
 * about line.
 */
export const shapeParticipant = (answer, p) => ({
  id: peerKey(p.peer),
  name: nameOf(entityOf(answer, p.peer)),
  source: Number(p.source) || 0,
  muted: Boolean(p.muted),
  mutedByYou: Boolean(p.mutedByYou),
  canSelfUnmute: Boolean(p.canSelfUnmute),
  activeDate: Number(p.activeDate) || 0,
  raisedHand: p.raiseHandRating !== undefined && p.raiseHandRating !== null,
  video: Boolean(p.video),
  presentation: Boolean(p.presentation),
  self: Boolean(p.self),
  left: Boolean(p.left),
  about: text(p.about),
  date: Number(p.date) || 0,
});

const shapeAll = (answer) =>
  (answer.participants ?? [])
    .map((p) => shapeParticipant(answer, p))
    .filter((p) => p.id && !p.left);

// The connection answer rides in an updateGroupCallConnection.
const connectionOf = (updates) => {
  const found = (updates?.updates ?? []).find(
    (u) => u.className === 'UpdateGroupCallConnection'
  );
  try {
    return found ? JSON.parse(found.params.data) : null;
  } catch {
    return null;
  }
};

const inputCall = (c, { id, accessHash }) =>
  new c.Api.InputGroupCall({
    id: c.helpers.returnBigInt(text(id)),
    accessHash: c.helpers.returnBigInt(text(accessHash)),
  });

// Who we act as: the account itself, or a peer the call allows.
const asPeer = (env, c, joinAs) =>
  joinAs
    ? inputOf(env, c.client, joinAs)
    : Promise.resolve(new c.Api.InputPeerSelf());

// What is asked about a call (nothing is changed).
const createCallReads = (env, { userClient }) => {
  const run = (use) => connected(env, userClient, failure, use);

  const fullChat = async (c, chat, peer) => {
    if (chat.startsWith('-100')) {
      const answer = await c.client.invoke(
        new c.Api.channels.GetFullChannel({ channel: peer })
      );
      return answer?.fullChat;
    }
    const answer = await c.client.invoke(
      new c.Api.messages.GetFullChat({
        chatId: c.helpers.returnBigInt(chat.slice(1)),
      })
    );
    return answer?.fullChat;
  };

  const callInfo = async ({ chat } = {}) => {
    if (!CHAT.test(text(chat))) {
      return { ok: false, supported: false };
    }
    return run((c) =>
      runIn(env, `voice-chat:${chat}`, () =>
        env.connection.withPeer(c.client, chat, async (peer) => {
          const full = await fullChat(c, chat, peer);
          if (!full?.call) {
            return { ok: true, call: null };
          }
          const answer = await c.client.invoke(
            new c.Api.phone.GetGroupCall({ call: full.call, limit: 3 })
          );
          const shaped = shapeCall(answer?.call);
          const joinAs = peerKey(full.groupcallDefaultJoinAs);
          return {
            ok: true,
            call: shaped
              ? {
                  ...(joinAs ? { defaultJoinAs: joinAs } : {}),
                  ...shaped,
                  recent: shapeAll(answer)
                    .slice(0, 3)
                    .map(({ id, name }) => ({ id, name })),
                }
              : null,
          };
        })
      )
    );
  };

  const pageOf = (answer, next) => ({
    participants: shapeAll(answer),
    next: text(next) || null,
  });

  const callOpen = async (request = {}) =>
    validCall(request)
      ? run(async (c) => {
          const answer = await c.client.invoke(
            new c.Api.phone.GetGroupCall({
              call: inputCall(c, request),
              limit: PAGE,
            })
          );
          const call = shapeCall(answer?.call);
          return call
            ? {
                ok: true,
                call,
                ...pageOf(answer, answer.participantsNextOffset),
                count: call.count,
              }
            : { ok: false, error: 'GROUPCALL_INVALID', code: 'gone' };
        })
      : bad();

  const callParticipants = async (request = {}) =>
    validCall(request) && /^[\w-]{0,200}$/.test(text(request.offset))
      ? run(async (c) => {
          const answer = await c.client.invoke(
            new c.Api.phone.GetGroupParticipants({
              call: inputCall(c, request),
              ids: [],
              sources: [],
              offset: text(request.offset),
              limit: PAGE,
            })
          );
          return {
            ok: true,
            ...pageOf(answer, answer.nextOffset),
            count: Number(answer.count) || 0,
          };
        })
      : bad();

  const callJoinAs = async ({ chat } = {}) =>
    CHAT.test(text(chat))
      ? run((c) =>
          env.connection.withPeer(c.client, chat, async (peer) => {
            const answer = await c.client.invoke(
              new c.Api.phone.GetGroupCallJoinAs({ peer })
            );
            const peers = (answer?.peers ?? [])
              .map((one) => ({
                id: peerKey(one),
                name: nameOf(entityOf(answer, one)),
                kind: one.userId ? 'user' : 'channel',
              }))
              .filter((one) => one.id);
            return { ok: true, peers };
          })
        )
      : { ok: false, supported: false };

  return { callInfo, callOpen, callParticipants, callJoinAs };
};

// What follows a click: Notify me, Join, Leave, our own mute and hand.
const createCallWrites = (env, { userClient }) => {
  const run = (use) => connected(env, userClient, failure, use);

  const callNotify = async (request = {}) =>
    validCall(request) && typeof request.subscribed === 'boolean'
      ? run(async (c) => {
          await c.client.invoke(
            new c.Api.phone.ToggleGroupCallStartSubscription({
              call: inputCall(c, request),
              subscribed: request.subscribed,
            })
          );
          return { ok: true, subscribed: request.subscribed };
        })
      : bad();

  const callJoin = async (request = {}) =>
    validCall(request) &&
    validParams(request.params) &&
    validJoinAs(request.joinAs)
      ? run(async (c) => {
          const updates = await c.client.invoke(
            new c.Api.phone.JoinGroupCall({
              muted: true,
              videoStopped: true,
              call: inputCall(c, request),
              joinAs: await asPeer(env, c, request.joinAs),
              params: new c.Api.DataJSON({ data: request.params }),
            })
          );
          const connection = connectionOf(updates);
          return connection
            ? {
                ok: true,
                connection,
                source: JSON.parse(request.params).ssrc | 0,
              }
            : { ok: false, error: 'no connection', code: 'failed' };
        })
      : bad();

  const callLeave = async (request = {}) =>
    validCall(request) && Number.isInteger(request.source)
      ? run(async (c) => {
          await c.client.invoke(
            new c.Api.phone.LeaveGroupCall({
              call: inputCall(c, request),
              source: request.source | 0,
            })
          );
          return { ok: true };
        })
      : bad();

  const callSelf = async (request = {}) =>
    validCall(request) &&
    typeof request.muted === 'boolean' &&
    validJoinAs(request.joinAs) &&
    (request.raiseHand === undefined || typeof request.raiseHand === 'boolean')
      ? run(async (c) => {
          await c.client.invoke(
            new c.Api.phone.EditGroupCallParticipant({
              call: inputCall(c, request),
              participant: await asPeer(env, c, request.joinAs),
              muted: request.muted,
              ...(request.raiseHand === undefined
                ? {}
                : { raiseHand: request.raiseHand }),
            })
          );
          return { ok: true };
        })
      : bad();

  return { callNotify, callJoin, callLeave, callSelf };
};

export const createVoiceChat = (env, context) => ({
  ...createCallReads(env, context),
  ...createCallWrites(env, context),
});
