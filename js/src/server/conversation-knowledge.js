// On-demand, bounded conversation analysis. Never copy archived provider payloads.
import { learnConversation } from '../crm/person-learn.js';
import { anchoredSuggestions } from './conversation-anchor.js';
import { readConversation } from './conversation-reader.js';
import {
  CONVERSATION_SETTINGS_ID,
  conversationSettings,
} from '../crm/conversation-policy.js';
import { chatKind } from '../web/chat-model.js';

import { conversationMessage } from '../crm/conversation-record.js';
export { conversationMessage } from '../crm/conversation-record.js';
const EMPTY = () => learnConversation([], { enabled: false });
const isPersonal = (messages) => {
  const type = messages.find((message) => message.chatType)?.chatType;
  if (type === 'bot_chat' || messages.some((message) => message.bot)) {
    return false;
  }
  const people = new Set(
    messages
      .filter((message) => message.sender !== 'me')
      .map((message) => message.sender)
  );
  return chatKind(type, people.size) === 'private';
};
const intersection = (saved, requested) =>
  Object.fromEntries(
    Object.entries(saved).map(([key, value]) => [
      key,
      value && requested?.[key] !== false,
    ])
  );

export const createConversationKnowledge = ({
  store,
  index,
  log = () => {},
  maxMessages = 20_000,
  maxChatBytes = 2 * 1024 ** 2,
  maxBytes = 8 * 1024 ** 2,
  maxChats = 48,
} = {}) => {
  const kept = new Map();
  const pending = new Map();
  let bytes = 0;
  let closed = false;
  const remove = (key) => {
    bytes -= kept.get(key)?.bytes ?? 0;
    kept.delete(key);
  };
  const settings = async (requested) =>
    intersection(
      conversationSettings((await store.get(CONVERSATION_SETTINGS_ID)) ?? {}),
      requested
    );
  const load = async (key, policy) => {
    await index.ready();
    const mark =
      String(index.revision?.(key) ?? index.count(key)) +
      JSON.stringify(policy);
    const cacheKey = key + JSON.stringify(policy);
    const hit = kept.get(cacheKey);
    if (hit?.mark === mark) {
      kept.delete(cacheKey);
      kept.set(cacheKey, hit);
      return hit;
    }
    if (pending.has(cacheKey)) {
      return pending.get(cacheKey);
    }
    const task = (async () => {
      const started = Date.now();
      const head = await index.page(key, {
        limit: 1,
        project: conversationMessage,
      });
      const data = isPersonal(head.messages)
        ? await readConversation(index, key, { maxMessages, maxChatBytes })
        : { messages: head.messages, bytes: 512, truncated: false };
      const personal = isPersonal(data.messages);
      const learned = personal
        ? learnConversation(data.messages, policy)
        : EMPTY();
      const result = { ...data, learned, personal, mark };
      result.bytes += JSON.stringify(learned).length * 2 + 32768; // Reserve one compact anchor result too.
      remove(cacheKey);
      if (!closed && result.bytes <= maxBytes) {
        kept.set(cacheKey, result);
        bytes += result.bytes;
        while (kept.size > maxChats || bytes > maxBytes) {
          remove(kept.keys().next().value);
        }
      }
      log?.({
        event: 'people_learned',
        groups: learned.asked.length,
        work: learned.work.length,
        accounts: learned.accounts.length,
        address: learned.address.basis,
        source: key.split(':')[0],
        messages: data.messages.length,
        questions: learned.questions.length,
        facts:
          learned.work.length +
          learned.accounts.length +
          learned.relationships.length,
        personal,
        truncated: data.truncated,
        duration_ms: Date.now() - started,
        cacheBytes: bytes,
        cachedChats: kept.size,
      });
      return result;
    })().finally(() => pending.delete(cacheKey));
    pending.set(cacheKey, task);
    return task;
  };
  return {
    settings,
    async get(key, requested) {
      const policy = await settings(requested);
      if (!policy.enabled) {
        return {
          messages: [],
          learned: EMPTY(),
          disabled: true,
          personal: true,
          truncated: false,
          policy,
        };
      }
      return { ...(await load(key, policy)), policy };
    },
    async suggest(key, options = {}) {
      const policy = await settings(options.settings);
      if (!policy.enabled || !policy.suggestions) {
        return { suggestions: [], context: null };
      }
      const data = await load(key, policy);
      if (!data.personal) {
        return { suggestions: [], context: null };
      }
      return anchoredSuggestions(
        data,
        key,
        { ...options, settings: policy },
        index,
        conversationMessage
      );
    },
    stats: () => ({ cachedChats: kept.size, bytes, pending: pending.size }),
    close() {
      closed = true;
      kept.clear();
      bytes = 0;
    },
  };
};
