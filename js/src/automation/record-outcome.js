/**
 * After a guarded send (R-Z3): the chat history and the run ledger. The
 * outbox already holds the truth, so a store that fails here never turns
 * a send that went out into a failure (and nothing is resent).
 */

import { runRecord } from './drafts.js';

const sentMessage = (draft, { at, via, automation }) => ({
  id: `msg:${draft.source}:${draft.chat}:out-${Date.parse(at)}`,
  tokens: ['message', draft.source, String(draft.chat)],
  source: draft.source,
  chat: String(draft.chat),
  sender: 'me',
  body: draft.text,
  timestamp: at,
  automation: automation.id,
  ...(via ? { via } : {}),
});

// Failures that say nothing happened to the ledger: it holds the truth.
const NO_RECORD = new Set([
  'already-sent',
  'send-in-doubt',
  'opted-out',
  'outbox-unavailable',
]);

/** Write what happened; returns the run record. */
export const recordOutcome = async ({
  store,
  automation,
  draft,
  outcome,
  nowIso,
  log,
}) => {
  if (outcome.status === 'sent') {
    const at = outcome.outbox?.at ?? nowIso();
    const via = outcome.result?.via;
    const record = runRecord(automation, draft, { status: 'sent', at, via });
    try {
      await store.put(sentMessage(draft, { at, via, automation }));
      await store.put(record);
    } catch (error) {
      log({ event: 'sent_not_recorded', error: error.message });
    }
    return record;
  }
  const record = runRecord(automation, draft, {
    status: outcome.status,
    at: nowIso(),
    error: outcome.error,
    code: outcome.code,
  });
  if (!NO_RECORD.has(outcome.code)) {
    await store
      .put(record)
      .catch((error) =>
        log({ event: 'failure_not_recorded', error: error.message })
      );
  }
  return record;
};
