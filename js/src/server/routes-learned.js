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

import { createConversationKnowledge } from './conversation-knowledge.js';
import {
  CONVERSATION_SETTINGS_ID,
  conversationSettings,
  requestedConversationSettings,
} from '../crm/conversation-policy.js';
import { historyLinkId } from '../sources/telegram-history.js';
import { json, readBody, bodyFailure } from './util.js';

const MAX_QUESTIONS = 200;
const splitKey = (key) => {
  const at = key.indexOf(':');
  return at > 0 ? { source: key.slice(0, at), chat: key.slice(at + 1) } : null;
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
  relationships: learned.relationships,
  summary: learned.summary,
  work: learned.work,
  asked: learned.asked.map(({ text, wordings, asked, answered, latest }) => ({
    text,
    wordings,
    asked,
    answered,
    answer: latest.answer,
    intent: latest.intent,
  })),
  theirAsked: learned.theirAsked.map(
    ({ text, wordings, asked, answered, latest }) => ({
      text,
      wordings,
      asked,
      answered,
      answer: latest.answer,
      intent: latest.intent,
    })
  ),
  questions: learned.questions.slice(-MAX_QUESTIONS),
  accounts: learned.accounts,
});

const readSettings = async (store) =>
  conversationSettings((await store.get(CONVERSATION_SETTINGS_ID)) ?? {});

const saveSettings = async (store, req, res) => {
  try {
    const body = await readBody(req, { allowEmpty: false });
    const valid = Object.entries(body).every(
      ([key, value]) =>
        Object.hasOwn(conversationSettings(), key) && typeof value === 'boolean'
    );
    if (!valid) {
      return (
        json(res, 400, { error: 'learning settings must be booleans' }) ?? true
      );
    }
    const settings = conversationSettings({
      ...(await readSettings(store)),
      ...body,
    });
    await store.put({
      id: CONVERSATION_SETTINGS_ID,
      tokens: ['conversation-learning', 'settings'],
      ...settings,
    });
    return json(res, 200, settings) ?? true;
  } catch (error) {
    const failure = bodyFailure(error);
    if (!failure) {
      throw error;
    }
    return json(res, ...failure) ?? true;
  }
};
const settingsRoute = async (store, req, res) => {
  if (req.method === 'GET') {
    return json(res, 200, await readSettings(store)) ?? true;
  }
  if (req.method === 'POST') {
    return saveSettings(store, req, res);
  }
  return false;
};
const learnedResult = (key, found, index) => ({
  key,
  personal: found.personal,
  disabled: found.disabled ?? false,
  messages: found.messages.length,
  total: index.count(key),
  truncated: found.truncated,
  settings: found.policy,
  name: found.personal ? nameIn(found.messages) : null,
  ...shaped(found.learned),
});
const enrich = async (store, ctx, where, result, cached) => {
  const complete = cached
    ? ((await store.get(historyLinkId(where.chat)))?.complete ?? null)
    : await completeness(store, ctx, where);
  const person =
    result.personal && !cached
      ? await personOf(ctx, where, result.name)
      : { name: null, username: null };
  return {
    ...result,
    complete,
    loadingHistory: !cached && complete === false,
    accounts: cached
      ? result.accounts
      : await withGitHub(ctx, result.accounts, person),
  };
};

export const createLearnedRoute =
  () => async (store, req, res, p, url, ctx) => {
    if (p === '/api/people/learning-settings') {
      return settingsRoute(store, req, res);
    }
    if (p !== '/api/people/learned' || req.method !== 'GET') {
      return false;
    }
    const key = url.searchParams.get('key') ?? '';
    const where = splitKey(key);
    if (!where || !ctx.chatIndex) {
      return json(res, 400, { error: 'key is required' }) ?? true;
    }
    ctx.knowledge ??= createConversationKnowledge({
      store,
      index: ctx.chatIndex,
      log: ctx.log,
    });
    const found = await ctx.knowledge.get(
      key,
      requestedConversationSettings(url.searchParams)
    );
    const result = learnedResult(key, found, ctx.chatIndex);
    const cached = url.searchParams.get('cached') === '1' || found.disabled;
    return (
      json(res, 200, await enrich(store, ctx, where, result, cached)) ?? true
    );
  };
