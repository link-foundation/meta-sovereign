/**
 * Fact extraction (R-C5).
 *
 * Given a list of `Pattern`s, scan a chat's messages for
 * `question → answer` pairs: a message that matches a question
 * pattern, immediately followed by a partner reply, becomes a fact
 * attributed to that partner. Output is grouped by participant so it
 * works in group chats.
 */

import { matchAll } from '../patterns/index.js';

const inChat = (messages, patterns, limit) => {
  const sorted = [...messages].sort((a, b) =>
    String(a.timestamp).localeCompare(String(b.timestamp))
  );
  const facts = [];
  for (let i = 0; i < sorted.length - 1 && facts.length < limit; i += 1) {
    const m = sorted[i];
    const next = sorted[i + 1];
    if (m.sender === next.sender) {
      continue;
    }
    for (const p of patterns) {
      if (facts.length >= limit) {
        break;
      }
      if (matchAll(p.regex, [m.body]).length > 0) {
        facts.push({
          patternId: p.id,
          question: m.body,
          answer: next.body,
          asker: m.sender,
          answerer: next.sender,
          chat: m.chat,
          timestamp: next.timestamp,
        });
      }
    }
  }
  return facts;
};
export const extractFacts = (messages, patterns, { limit = Infinity } = {}) => {
  const chats = new Map();
  for (const message of messages) {
    const key = `${message.source ?? ''}:${message.chat ?? ''}`;
    const list = chats.get(key) ?? [];
    list.push(message);
    chats.set(key, list);
  }
  const facts = [];
  for (const list of chats.values()) {
    facts.push(...inChat(list, patterns, limit - facts.length));
    if (facts.length >= limit) {
      break;
    }
  }
  const byAnswerer = new Map();
  for (const f of facts) {
    const arr = byAnswerer.get(f.answerer) ?? [];
    arr.push(f);
    byAnswerer.set(f.answerer, arr);
  }
  return { facts, byAnswerer: Object.fromEntries(byAnswerer) };
};
