/**
 * What a personal conversation tells about the other person
 * (R-Y50 .. R-Y54), learned from the stored history:
 *
 *   GET /api/people/learned?key=<source>:<chat>
 *   → { key, personal, complete, messages, address, work, accounts,
 *       asked, questions }
 *
 * Read from the store only (../crm/person-learn.js), never from the
 * network. A Telegram chat whose history is not stored to its first
 * message yet is asked for first by the background download, and the
 * answer says `complete: false` until it is. The result is kept until
 * the chat gains or loses a message. GitHub accounts the person sent are
 * checked once a week (../sources/github-check.js). Only counts are
 * logged, never what was said.
 */

import { learnConversation } from '../crm/person-learn.js';
import { historyLinkId } from '../sources/telegram-history.js';
import { chatKind } from '../web/chat-model.js';
import { json } from './util.js';

const PAGE = 500;
const MAX_MESSAGES = 20_000;
const MAX_QUESTIONS = 200;

const splitKey = (key) => {
  const at = key.indexOf(':');
  return at > 0 ? { source: key.slice(0, at), chat: key.slice(at + 1) } : null;
};

// The whole stored conversation, oldest first.
const conversation = async (index, key) => {
  const pages = [];
  let before = null;
  let total = 0;
  for (;;) {
    const { messages, more } = await index.page(key, { before, limit: PAGE });
    pages.unshift(messages);
    total += messages.length;
    if (!more || messages.length === 0 || total >= MAX_MESSAGES) {
      return pages.flat();
    }
    before = messages[0].id;
  }
};

const isPersonal = (messages) => {
  const people = new Set(
    messages.map((m) => m.sender).filter((s) => s && s !== 'me')
  );
  const type = messages.find((m) => m.chatType)?.chatType ?? null;
  return chatKind(type, people.size) === 'private';
};

// Telegram: whether the store holds the chat to its first message; if
// not, the download reads it before any other chat.
const completeness = async (store, ctx, { source, chat }) => {
  if (source !== 'telegram') {
    return null;
  }
  if ((await store.get(historyLinkId(chat)))?.complete) {
    return true;
  }
  // Without an account nothing reads the rest: unknown, not "reading".
  if (typeof ctx.telegramAccount?.readFirst !== 'function') {
    return null;
  }
  ctx.telegramAccount.readFirst(chat);
  return false;
};

const nameIn = (messages) =>
  messages.findLast((m) => m.sender !== 'me' && m.senderName)?.senderName ??
  null;

const personOf = async (ctx, { source, chat }, name) => {
  const info =
    source === 'telegram' && typeof ctx.telegramAccount?.chatInfo === 'function'
      ? await ctx.telegramAccount.chatInfo({ chat }).catch(() => null)
      : null;
  return { name: info?.title ?? name, username: info?.username ?? null };
};

const withGitHub = (ctx, accounts, person) =>
  Promise.all(
    accounts.map(async (account) =>
      account.network === 'github' && ctx.githubCheck
        ? {
            ...account,
            github: await ctx.githubCheck.check(account.handle, person),
          }
        : account
    )
  );

const shaped = (learned) => ({
  address: learned.address,
  work: learned.work,
  asked: learned.asked.map(({ text, wordings, asked, answered, latest }) => ({
    text,
    wordings,
    asked,
    answered,
    answer: latest.answer,
    intent: latest.intent,
  })),
  questions: learned.questions.slice(-MAX_QUESTIONS),
  accounts: learned.accounts,
});

// What was learned, by number only (for the log).
const countsOf = (learned) =>
  learned
    ? {
        questions: learned.questions.length,
        groups: learned.asked.length,
        work: learned.work.length,
        accounts: learned.accounts.length,
        address: learned.address.basis,
      }
    : {};

export const createLearnedRoute = ({ now = Date.now } = {}) => {
  const kept = new Map(); // key → { mark, result }

  const learn = async (ctx, key, where) => {
    const index = ctx.chatIndex;
    // The newest message (which also waits for the index to load) and
    // the count say whether the chat changed since it was learned.
    const { messages: newest } = await index.page(key, { limit: 1 });
    const mark = `${index.count(key)}:${newest[0]?.id ?? ''}`;
    const hit = kept.get(key);
    if (hit?.mark === mark) {
      return hit.result;
    }
    const started = now();
    const messages = await conversation(index, key);
    const personal = isPersonal(messages);
    const learned = personal ? learnConversation(messages) : null;
    const result = {
      key,
      personal,
      messages: messages.length,
      name: personal ? nameIn(messages) : null,
      ...(learned ? shaped(learned) : { accounts: [] }),
    };
    kept.set(key, { mark, result });
    ctx.log?.({
      ...countsOf(learned),
      event: 'people_learned',
      messages: messages.length,
      personal,
      duration_ms: now() - started,
      source: where.source,
    });
    return result;
  };

  return async (store, req, res, p, url, ctx) => {
    if (p !== '/api/people/learned' || req.method !== 'GET') {
      return false;
    }
    const key = url.searchParams.get('key') ?? '';
    const where = splitKey(key);
    if (!where || !ctx.chatIndex) {
      return json(res, 400, { error: 'key is required' }) ?? true;
    }
    const result = await learn(ctx, key, where);
    const complete = await completeness(store, ctx, where);
    const person = result.personal
      ? await personOf(ctx, where, result.name)
      : { name: null, username: null };
    return (
      json(res, 200, {
        ...result,
        complete,
        accounts: await withGitHub(ctx, result.accounts, person),
      }) ?? true
    );
  };
};
