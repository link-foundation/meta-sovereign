import { createHash } from 'node:crypto';
import { GENERAL_TOPIC, topicReplyId } from '../web/forum-topics.js';
import { apiEntities, parseFormatted } from './telegram-format.js';
import { messageLengthMax } from './telegram-message-limit.js';
import { sendError } from './telegram-send.js';
import { messageSenderId, peerChatId } from './telegram-updates.js';
import { CHANNEL } from './telegram-usernames.js';

const canContinue = (draft) =>
  draft.continueLast === true &&
  draft.clientId &&
  CHANNEL.test(draft.chat) &&
  !/^\/\w/.test(draft.text.trimStart()) &&
  ![
    'replyTo',
    'replyQuote',
    'silent',
    'scheduleDate',
    'allowPaidStars',
    'effect',
    'noWebpage',
    'invertMedia',
    'previewUrl',
  ].some((key) => draft[key]);

const isPublic = (channel) =>
  channel?.className === 'Channel' &&
  !channel.left &&
  !channel.monoforum &&
  !channel.sendPaidMessagesStars &&
  Boolean(channel.username || channel.usernames?.some((name) => name.active));

// A topic's topMessage is authoritative even when the chat UI is looking
// at an older page or a different topic has the newest message overall.
const forumTail = (answer, topic) => {
  const row = answer?.topics?.find((entry) => entry.id === topic);
  return row && !row.closed && !row.hidden && row.topMessage
    ? answer.messages?.find((message) => message.id === row.topMessage)
    : null;
};

const readTail = async (client, { Api, helpers }, peer, channel, topic) => {
  if (channel.forum) {
    const answer = await client.invoke(
      new Api.messages.GetForumTopicsByID({ peer, topics: [topic] })
    );
    return forumTail(answer, topic);
  }
  if (topic !== GENERAL_TOPIC) {
    return null;
  }
  const result = await client.invoke(
    new Api.messages.GetHistory({
      peer,
      offsetId: 0,
      offsetDate: 0,
      addOffset: 0,
      limit: 1,
      maxId: 0,
      minId: 0,
      hash: helpers.returnBigInt(0),
    })
  );
  return result?.messages?.[0];
};

const isOwn = (message, sender) => {
  const author =
    messageSenderId(message) ??
    (message?.post ? peerChatId(message.peerId) : null);
  return message?.out === true && author === sender;
};

const specialFields = [
  'fwdFrom',
  'viaBotId',
  'viaBusinessBotId',
  'groupedId',
  'richMessage',
  'replyMarkup',
  'suggestedPost',
];

const isPlain = (message, topic) => {
  if (
    message?.className !== 'Message' ||
    !Number.isInteger(message.id) ||
    !message.message?.trim() ||
    specialFields.some((field) => message[field]) ||
    (message.media && message.media.className !== 'MessageMediaEmpty')
  ) {
    return false;
  }
  const reply = message.replyTo;
  return (
    (!reply && topic === GENERAL_TOPIC) ||
    (reply?.forumTopic &&
      !reply.quote &&
      !reply.replyToPeerId &&
      reply.replyToMsgId === topicReplyId(topic))
  );
};

const editRequest = (Api, peer, message, text, maxLength) => {
  const next = parseFormatted(text);
  const prefix = `${message.message}\n\n`;
  if (!next.text.trim() || prefix.length + next.text.length > maxLength) {
    return null;
  }
  const entities = next.entities.map((entity) => ({
    ...entity,
    offset: entity.offset + prefix.length,
  }));
  return new Api.messages.EditMessage({
    peer,
    id: message.id,
    noWebpage: true,
    message: prefix + next.text,
    entities: [...(message.entities ?? []), ...apiEntities(Api, entities)],
  });
};

const prepare = async (client, imports, peer, me, draft) => {
  const { Api } = imports;
  const full = await client.invoke(
    new Api.channels.GetFullChannel({ channel: peer })
  );
  const channel = full?.chats?.find(
    (chat) => `-100${String(chat.id)}` === draft.chat
  );
  if (!isPublic(channel)) {
    return null;
  }
  const topic = draft.topic ?? GENERAL_TOPIC;
  const sender =
    peerChatId(full.fullChat?.defaultSendAs) ??
    (channel.broadcast ? draft.chat : me?.id);
  if (!sender || (draft.sendAs && draft.sendAs !== sender)) {
    return null;
  }
  const maxLength = await messageLengthMax(client, Api);
  const last = await readTail(client, imports, peer, channel, topic);
  return isOwn(last, sender) && isPlain(last, topic)
    ? editRequest(Api, peer, last, draft.text, maxLength)
    : null;
};

const FALL_BACK = new Set([
  'MESSAGE_AUTHOR_REQUIRED',
  'MESSAGE_EDIT_TIME_EXPIRED',
  'MESSAGE_ID_INVALID',
  'MESSAGE_TOO_LONG',
  'CHAT_ADMIN_REQUIRED',
]);

const unknown = () =>
  Object.assign(new Error('send-unknown'), { code: 'send-unknown' });

const receiptId = (draft) => {
  const key = JSON.stringify([draft.chat, draft.clientId]);
  return `message-continuation:telegram:${createHash('sha256').update(key).digest('hex')}`;
};

const editedResult = async (store, linkId) => {
  const link = linkId ? await store.get(linkId).catch(() => null) : null;
  return { edited: true, link: link?.deleted ? null : link };
};

// An edit has no clear_draft flag. Clear the just-sent cloud draft if
// it is still the one last saved here.
const clearSentDraft = async (env, { client, request, Api }, draft, before) => {
  if (before?.draft?.trim() !== draft.text.trim()) {
    return;
  }
  const current = await env.store.get(`read:telegram:${draft.chat}`);
  if (current?.draft !== before.draft || current.draftAt !== before.draftAt) {
    return;
  }
  await client.invoke(
    new Api.messages.SaveDraft({ peer: request.peer, message: '' })
  );
  await env.live.draft?.({
    chat: draft.chat,
    text: '',
    date: Math.floor(env.now() / 1000),
  });
};

const invokeEdit = async (plan, mark, store, receipt) => {
  try {
    return { result: await plan.client.invoke(plan.request) };
  } catch (error) {
    if (error?.errorMessage === 'MESSAGE_NOT_MODIFIED') {
      // Telegram already has exactly the requested edit.
      return { result: null };
    }
    if (FALL_BACK.has(error?.errorMessage)) {
      await mark('post');
      return null;
    }
    const failure = sendError(error);
    if (
      failure.code === 'flood-wait' ||
      (error?.code >= 400 && error.code < 500 && error.errorMessage)
    ) {
      await store.delete(receipt);
      throw failure;
    }
    throw unknown();
  }
};

/** Try a provider edit as part of one confirmed send. The receipt prevents a
 * retry after restart from appending twice or turning an uncertain edit into a post. */
export const createMessageContinuation = (env, { credentials, apply }) => {
  const { store } = env;
  return async (draft) => {
    if (!canContinue(draft)) {
      return null;
    }
    const id = receiptId(draft);
    const before = await store.get(id);
    if (before?.state === 'edited') {
      return editedResult(store, before.linkId);
    }
    if (before?.state === 'editing') {
      throw unknown();
    }
    if (before?.state === 'post') {
      return null;
    }
    const creds = await credentials();
    if (creds?.kind !== 'user') {
      return null;
    }
    const mark = (state, linkId = null) =>
      store.put({ id, tokens: [], state, linkId });
    const plan = await env.queue
      .run(`continue:${id}`, 'view', async () => {
        const { client, me } = await env.connection.open(creds);
        const imports = await env.importer();
        const request = await env.connection.withPeer(
          client,
          draft.chat,
          (peer) => prepare(client, imports, peer, me, draft)
        );
        return request ? { client, request, Api: imports.Api } : null;
      })
      .catch((error) => {
        env.log?.({
          level: 'debug',
          event: 'telegram_continuation_read_failed',
          code: sendError(error).code,
        });
        return null;
      });
    if (!plan) {
      await mark('post');
      return null;
    }
    const { client, request } = plan;
    const linkId = `msg:telegram:${draft.chat}:${request.id}`;
    const cloudDraft = await store.get(`read:telegram:${draft.chat}`);
    await mark('editing', linkId);
    const answer = await invokeEdit(plan, mark, store, id);
    if (!answer) {
      return null;
    }
    const updated = await apply(client, answer.result).then(
      () => editedResult(store, linkId),
      () => ({ edited: true, link: null })
    );
    // A result without an edit update must not put an old copy back in Chat.
    const link = updated.link?.body === request.message ? updated.link : null;
    await mark('edited', link ? linkId : null).catch(() => {
      env.log?.({ level: 'warn', event: 'telegram_continuation_store_failed' });
    });
    await clearSentDraft(env, plan, draft, cloudDraft).catch(() => {
      env.log?.({
        level: 'debug',
        event: 'telegram_continuation_draft_failed',
      });
    });
    return { edited: true, link };
  };
};
