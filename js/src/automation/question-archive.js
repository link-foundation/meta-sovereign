import { historyOrder } from '../replies/history-order.js';
import { createAnswerLearner } from './question-learning.js';
import { QA_RULE_PREFIX } from './question-answers.js';
import { QA_POLICY_ID } from './question-policy.js';
import { QA_PROFILE_PREFIX } from './question-profiles.js';
import { debugQuestionTurn } from './question-turns.js';

const MAX_INDEX_BYTES = 64 * 1024 ** 2;
const chatKey = (message) =>
  JSON.stringify([message.source, String(message.chat)]);
const metadata = (message) => ({
  id: message.id,
  source: message.source,
  chat: message.chat,
  timestamp: message.timestamp,
});
const messageProjection = (message) => {
  const valid =
    typeof message.body === 'string' && message.body.length <= 12000;
  return {
    ...metadata(message),
    sender: message.sender,
    body: valid ? message.body : '',
    service: message.service || !valid,
    deleted: message.deleted,
    replyTo: message.replyTo,
    pending: message.pending,
    failed: message.failed,
    delivery: message.delivery,
    status: message.status,
    out: message.out,
    outgoing: message.outgoing,
  };
};

// The scan-capable production stores retain metadata only, like the existing
// chat index. The query-only compatibility path still materializes its query.
// Payloads are fetched one at a time after indexing.
export const indexAnswerArchive = async (store, maxBytes = MAX_INDEX_BYTES) => {
  const chats = new Map();
  let bytes = 0;
  let seen = 0;
  const add = (message) => {
    const key = chatKey(message);
    const chat = chats.get(key) ?? { entries: [], invalid: false };
    bytes += message.id.length * 2 + String(message.timestamp).length * 2 + 96;
    if (!chats.has(key)) {
      bytes += key.length * 2 + 256;
    }
    if (bytes > maxBytes) {
      throw new Error(
        'archive metadata capacity exceeded; no proposals applied'
      );
    }
    chat.invalid ||=
      typeof message.source !== 'string' ||
      !message.source ||
      message.chat === undefined ||
      message.chat === null ||
      !Number.isFinite(Date.parse(message.timestamp));
    chat.entries.push({ id: message.id, timestamp: message.timestamp });
    chats.set(key, chat);
    seen++;
  };
  const select = (link) => link?.id?.startsWith('msg:');
  if (store.scan) {
    await store.scan(select, 256, (batch) => batch.forEach(add), metadata);
  } else {
    (await store.query(select)).forEach(add);
  }
  return { chats, seen, bytes };
};

export const archiveReadGuard = (store) => {
  let changed = false;
  let knowledgeChanged = false;
  const stop = store.subscribe?.((event) => {
    const id = event.link?.id;
    changed ||= id?.startsWith('msg:') === true;
    knowledgeChanged ||=
      id === QA_POLICY_ID ||
      id?.startsWith(QA_RULE_PREFIX) === true ||
      id?.startsWith(QA_PROFILE_PREFIX) === true;
  });
  return {
    check() {
      if (knowledgeChanged) {
        debugQuestionTurn('learning-invalidated', { kind: 'knowledge' });
        throw new Error(
          'answer knowledge changed during learning; retry before applying'
        );
      }
      if (changed) {
        debugQuestionTurn('learning-invalidated', { kind: 'archive' });
        throw new Error(
          'archive changed during learning; retry before applying'
        );
      }
    },
    close: () => stop?.(),
  };
};

export const learnArchivedAnswers = async (store, options) => {
  const { chats, seen, bytes } = await indexAnswerArchive(store);
  const learner = createAnswerLearner(options);
  let retained = 0;
  let excludedChats = 0;
  for (const [key, chat] of chats) {
    if (chat.invalid) {
      excludedChats++;
      chats.delete(key);
      continue;
    }
    chat.entries.sort(historyOrder);
    for (const entry of chat.entries) {
      const message = await store.get(entry.id, messageProjection);
      if (
        !message ||
        chatKey(message) !== key ||
        message.timestamp !== entry.timestamp
      ) {
        throw new Error(
          'archive changed during learning; retry before applying'
        );
      }
      learner.accept(messageProjection(message));
      retained++;
    }
    learner.finishChat();
    chats.delete(key);
  }
  return {
    rules: learner.rules(),
    coverage: {
      scope: 'archive',
      seen,
      retained,
      limited: retained < seen,
      excludedChats,
      indexBytes: bytes,
      maxIndexBytes: MAX_INDEX_BYTES,
    },
  };
};
