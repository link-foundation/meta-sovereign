/**
 * Polls and checklists, as Telegram's own apps have them (R-Y74).
 *
 * - `UpdateMessagePoll` (a vote anywhere, ours too; its effect is in
 *   ./telegram-updates.js) writes the poll's
 *   results into the stored message's `raw.media`. Results marked `min`
 *   carry counts only: what we chose and which answer is right are kept
 *   from what was stored.
 * - `vote` (messages.sendVote; no options retracts), `stop` (the poll's
 *   author closes it: messages.editMessage with the poll `closed`),
 *   `results` (messages.getPollResults, for a poll on screen: Telegram
 *   sends a poll's results only to who asks), `votes` (who voted for
 *   what in a public poll: messages.getPollVotes) and `toggleTodo`
 *   (messages.toggleTodoCompleted).
 *
 * - `sendPoll` (a new poll, R-Y121: messages.sendMedia with InputMediaPoll; its
 *   answers as InputPollAnswer, a quiz's right one by its place;
 *   Telegram's answer goes to the live handler).
 *
 * An option is bytes; the app and the store name it in base64 (R-Y28).
 */

import { peerChatId } from './telegram-updates.js';
import { withSendAs } from './telegram-send-as-client.js';
import { randomIdOf, replyHeader, sendError } from './telegram-send.js';

const SOURCE = 'telegram';

const text = (value) =>
  value === null || value === undefined ? null : String(value.value ?? value);

const msgIdOf = (link) =>
  Number(
    String(link?.id ?? '')
      .split(':')
      .pop()
  );

const optionKey = (option) => option?.bytes ?? JSON.stringify(option ?? null);

/**
 * `next` results over `before`: a `min` answer (counts only) keeps what
 * we chose, which answer is right and the solution from `before`.
 */
export const mergePollResults = (before, next) => {
  if (!next) {
    return before ?? null;
  }
  if (!next.min || !before) {
    return next;
  }
  const known = new Map(
    (before.results ?? []).map((r) => [optionKey(r.option), r])
  );
  return {
    ...next,
    results: (next.results ?? before.results ?? []).map((r) => {
      const was = known.get(optionKey(r.option));
      return {
        ...r,
        chosen: r.chosen ?? was?.chosen ?? null,
        correct: r.correct ?? was?.correct ?? null,
      };
    }),
    solution: next.solution ?? before.solution ?? null,
    solutionEntities: next.solutionEntities ?? before.solutionEntities ?? null,
  };
};

const isPollOf = (pollId) => (l) =>
  l?.id?.startsWith(`msg:${SOURCE}:`) &&
  l.raw?.media?.className === 'MessageMediaPoll' &&
  text(l.raw.media.poll?.id) === pollId;

/** Write a poll effect; true when a stored message changed. */
export const pollWriter = async (store, effect) => {
  const named =
    effect.chat && effect.id
      ? [await store.get(`msg:${SOURCE}:${effect.chat}:${effect.id}`)]
      : await store.query(isPollOf(effect.pollId));
  let changed = false;
  for (const link of named.filter(Boolean)) {
    const media = link.raw?.media;
    if (media?.className !== 'MessageMediaPoll') {
      continue;
    }
    const next = {
      ...media,
      poll: effect.poll ?? media.poll,
      results: mergePollResults(media.results, effect.results),
    };
    if (JSON.stringify(next) !== JSON.stringify(media)) {
      await store.put({ ...link, raw: { ...link.raw, media: next } });
      changed = true;
    }
  }
  return changed;
};

const bytesOf = (b64) => Buffer.from(String(b64 ?? ''), 'base64');

const cleanOptions = (options) =>
  Array.isArray(options)
    ? options.filter((o) => typeof o === 'string' && o.length > 0).slice(0, 20)
    : [];

const cleanIds = (ids) =>
  Array.isArray(ids)
    ? ids.filter((id) => Number.isInteger(id) && id > 0).slice(0, 100)
    : [];

// The stored poll as GramJS's `Poll`, closed: what stops a poll.
const closedPoll = (Api, helpers, poll) =>
  new Api.Poll({
    id: helpers.returnBigInt(String(poll.id)),
    closed: true,
    publicVoters: Boolean(poll.publicVoters),
    multipleChoice: Boolean(poll.multipleChoice),
    quiz: Boolean(poll.quiz),
    question: new Api.TextWithEntities({
      text: poll.question?.text ?? String(poll.question ?? ''),
      entities: [],
    }),
    answers: (poll.answers ?? []).map(
      (a) =>
        new Api.PollAnswer({
          text: new Api.TextWithEntities({
            text: a.text?.text ?? String(a.text ?? ''),
            entities: [],
          }),
          option: bytesOf(a.option?.bytes),
        })
    ),
    hash: helpers.returnBigInt(String(poll.hash ?? 0)),
  });

const withText = (Api, value) =>
  new Api.TextWithEntities({ text: String(value), entities: [] });

// A new poll as `InputMediaPoll`: its answers as `InputPollAnswer`
// (Telegram names them), the right one of a quiz by its place — layer
// 225's way of making a poll.
const newPoll = (Api, helpers, draft) => {
  const quiz = draft.quiz === true;
  return new Api.InputMediaPoll({
    poll: new Api.Poll({
      id: helpers.returnBigInt(0),
      publicVoters: draft.anonymous === false,
      multipleChoice: !quiz && draft.multiple === true,
      quiz,
      question: withText(Api, draft.question),
      answers: draft.options.map(
        (option) => new Api.InputPollAnswer({ text: withText(Api, option) })
      ),
      hash: helpers.returnBigInt(0),
    }),
    ...(quiz ? { correctAnswers: [draft.correct] } : {}),
    ...(quiz && draft.solution
      ? { solution: String(draft.solution), solutionEntities: [] }
      : {}),
  });
};

// Who voted, by name: from the users and chats Telegram sent along.
const namesOf = (result) => {
  const names = new Map();
  for (const u of result?.users ?? []) {
    names.set(
      text(u.id),
      [u.firstName, u.lastName].filter(Boolean).join(' ') ||
        (u.username ? `@${u.username}` : null)
    );
  }
  for (const c of result?.chats ?? []) {
    names.set(`-${text(c.id)}`, c.title ?? null);
    names.set(`-100${text(c.id)}`, c.title ?? null);
  }
  return names;
};

const voteOf = (names) => (v) => {
  const peer = peerChatId(v.peer);
  const options = v.options ?? (v.option ? [v.option] : []);
  return {
    peer,
    name: names.get(peer) ?? null,
    options: options.map((o) => Buffer.from(o).toString('base64')),
    date: Number(v.date) || null,
  };
};

// A new poll (messages.sendMedia); Telegram's answer goes through the
// live handler, so it shows in the chat as other sends do.
const createPollSender =
  (env, { userClient, apply }) =>
  async (draft = {}) => {
    const target = String(draft.chat ?? '');
    const own = target ? await userClient() : null;
    if (!own) {
      return { ok: false, supported: false };
    }
    const { Api, helpers } = await env.importer();
    try {
      const client = await withSendAs(
        env,
        own,
        draft.sendAs,
        draft.allowPaidStars
      );
      const result = await env.connection.withPeer(client, target, (peer) =>
        env.queue.run(`poll:send:${target}`, 'view', () =>
          client.invoke(
            new Api.messages.SendMedia({
              peer,
              media: newPoll(Api, helpers, draft),
              message: '',
              randomId: randomIdOf(draft.clientId, 0, helpers),
              clearDraft: false,
              ...(draft.silent ? { silent: true } : {}),
              ...(draft.scheduleDate
                ? { scheduleDate: draft.scheduleDate }
                : {}),
              ...replyHeader(Api, draft.replyTo, null),
            })
          )
        )
      );
      if (result && typeof result === 'object') {
        await apply(client, result);
      }
    } catch (error) {
      throw sendError(error);
    }
    if (draft.scheduleDate) {
      env.actions?.scheduledChanged?.(target);
      return { ok: true, chat: target, scheduled: true };
    }
    return { ok: true, chat: target };
  };

/**
 * The poll and checklist actions over the user's client. `apply(client,
 * result)` sends Telegram's answer through the live handler.
 */
export const createPollActions = (env, { userClient, apply }) => {
  const { store } = env;

  // `fn(client, peer, Api, helpers, link)` for one stored message.
  const withMessage = async ({ chat, id }, fn) => {
    const msgId = Number(id);
    const client = chat && msgId > 0 ? await userClient() : null;
    if (!client) {
      return { ok: false, supported: false };
    }
    const target = String(chat);
    const link = await store.get(`msg:${SOURCE}:${target}:${msgId}`);
    const { Api, helpers } = await env.importer();
    return env.connection.withPeer(client, target, (peer) =>
      fn(client, peer, Api, helpers, link ?? { id: `msg:x:${msgId}` })
    );
  };

  const vote = (request) =>
    withMessage(request, async (client, peer, Api, _h, link) => {
      const options = cleanOptions(request.options);
      const result = await env.queue.run(
        `vote:${request.chat}:${msgIdOf(link)}`,
        'view',
        () =>
          client.invoke(
            new Api.messages.SendVote({
              peer,
              msgId: msgIdOf(link),
              options: options.map(bytesOf),
            })
          )
      );
      await apply(client, result);
      return { ok: true, voted: options.length, retracted: !options.length };
    });

  const stop = (request) =>
    withMessage(request, async (client, peer, Api, helpers, link) => {
      const poll = link.raw?.media?.poll;
      if (!poll?.id) {
        return { ok: false, code: 'not-a-poll' };
      }
      const result = await client.invoke(
        new Api.messages.EditMessage({
          peer,
          id: msgIdOf(link),
          media: new Api.InputMediaPoll({
            poll: closedPoll(Api, helpers, poll),
          }),
        })
      );
      await apply(client, result);
      return { ok: true, stopped: msgIdOf(link) };
    });

  const results = (request) =>
    withMessage(request, async (client, peer, Api, helpers, link) => {
      const poll = link.raw?.media?.poll;
      const result = await env.queue.run(
        `poll-results:${request.chat}:${msgIdOf(link)}`,
        'prefetch',
        () =>
          client.invoke(
            new Api.messages.GetPollResults({
              peer,
              msgId: msgIdOf(link),
              pollHash: helpers.returnBigInt(String(poll?.hash ?? 0)),
            })
          )
      );
      await apply(client, result);
      return { ok: true };
    });

  const votes = (request) =>
    withMessage(request, async (client, peer, Api, _h, link) => {
      const result = await env.queue.run(
        `poll-votes:${request.chat}:${msgIdOf(link)}:${request.option ?? ''}:${request.offset ?? ''}`,
        'view',
        () =>
          client.invoke(
            new Api.messages.GetPollVotes({
              peer,
              id: msgIdOf(link),
              ...(request.option ? { option: bytesOf(request.option) } : {}),
              ...(request.offset ? { offset: String(request.offset) } : {}),
              limit: Math.min(Math.max(Number(request.limit) || 50, 1), 100),
            })
          )
      );
      const names = namesOf(result);
      return {
        ok: true,
        count: Number(result?.count ?? 0),
        nextOffset: result?.nextOffset ?? null,
        votes: (result?.votes ?? []).map(voteOf(names)),
      };
    });

  const toggleTodo = (request) =>
    withMessage(request, async (client, peer, Api, _h, link) => {
      const result = await client.invoke(
        new Api.messages.ToggleTodoCompleted({
          peer,
          msgId: msgIdOf(link),
          completed: cleanIds(request.completed),
          incompleted: cleanIds(request.incompleted),
        })
      );
      await apply(client, result);
      return { ok: true };
    });

  return {
    sendPoll: createPollSender(env, { userClient, apply }),
    votePoll: vote,
    stopPoll: stop,
    pollResults: results,
    pollVotes: votes,
    toggleTodo,
  };
};
