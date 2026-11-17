import { draftConfirmationKey } from './draft-confirmation.js';
import { engagementSteps } from './engagement.js';
import { outboxId, outboxKey } from './outbox.js';

const active = new WeakMap();
const refused = (draft, code, error, progress) => ({
  status: 'failed',
  draft,
  code,
  error,
  progress,
});
const progressOf = (steps, records) => ({
  total: steps.length,
  sent: records.filter((record) => record?.status === 'sent').length,
  steps: steps.map((step, index) => ({
    index: index + 1,
    kind: step.sticker ? 'sticker' : 'text',
    status: records[index]?.status ?? 'pending',
    ...(records[index]?.vkReceipt
      ? { receipt: records[index].vkReceipt.id }
      : {}),
  })),
});

const replyParts = (draft) => {
  const steps = engagementSteps(draft);
  const key = outboxKey({
    owner: draft.automation,
    source: draft.source,
    chat: draft.chat,
    step: `engagement:${draft.engagement.message}`,
  });
  const keys = steps.map((_, index) => `${key}:${index + 1}`);
  return { key, keys, steps };
};
export const orderedReplyState = async (store, draft) => {
  const { key, keys, steps } = replyParts(draft);
  const records = await Promise.all(
    keys.map((entry) => store.get(outboxId(entry)))
  );
  return { key, keys, steps, records, progress: progressOf(steps, records) };
};

const receiptMissing = (draft, progress) =>
  refused(
    draft,
    'sequence-receipt-missing',
    'The acknowledged provider message ID could not be retained; check the outbox and chat manually',
    progress
  );

const admission = (draft, records, signature, reviewed, progress) => {
  if (
    records.some((record) => record && record.sequence?.signature !== signature)
  ) {
    return refused(
      draft,
      'sequence-changed',
      'Review the original ordered reply before resuming',
      progress
    );
  }
  if (!records[0] && records[1]) {
    return receiptMissing(draft, progress);
  }
  if (
    records.some((record) => ['sending', 'unknown'].includes(record?.status))
  ) {
    return {
      ...refused(
        draft,
        'sequence-unknown',
        'Check the uncertain step in the outbox before continuing',
        progress
      ),
      status: 'unknown',
    };
  }
  if (
    records.some(Boolean) &&
    records.some((record) => record?.status !== 'sent') &&
    !reviewed
  ) {
    return refused(
      draft,
      'sequence-review-required',
      'Review the remaining step before continuing',
      progress
    );
  }
  return null;
};

const retainReceipt = async (store, key, signature) => {
  try {
    await store.flush?.();
    const retained = await store.get(outboxId(key));
    return retained?.status === 'sent' &&
      retained.vkReceipt &&
      retained.sequence?.signature === signature
      ? retained
      : null;
  } catch {
    return null;
  }
};

const stepFailure = (last, draft, progress, index) => ({
  ...last,
  draft,
  progress,
  ...(index
    ? {
        code:
          last.status === 'unknown' ? 'sequence-unknown' : 'sequence-partial',
        stepCode: last.code,
      }
    : {}),
});

const deliverSteps = async (
  { store, automation, draft, reviewed, deliver, signal },
  state,
  signature
) => {
  const { steps, keys, records } = state;
  const progress = () => progressOf(steps, records);
  let last;
  for (let index = 0; index < steps.length; index += 1) {
    if (records[index]?.status === 'sent') {
      if (!records[index].vkReceipt) {
        return receiptMissing(draft, progress());
      }
      continue;
    }
    const child = {
      ...draft,
      ...steps[index],
      sticker: steps[index].sticker,
      sequence: { key: keys[index], index: index + 1, signature },
    };
    last = await deliver(automation, child, {
      reviewed,
      signal,
      orderedStep: true,
      acknowledged: index ? records[0]?.vkReceipt : null,
    });
    records[index] = last.outbox ?? null;
    if (last.status !== 'sent') {
      return stepFailure(last, draft, progress(), index);
    }
    // An in-memory successful return is insufficient to start the next step.
    const retained = await retainReceipt(store, keys[index], signature);
    if (!retained) {
      return receiptMissing(draft, progress());
    }
    records[index] = retained;
  }
  return {
    status: 'sent',
    draft,
    record: last?.record,
    outbox: records.at(-1),
    progress: progress(),
  };
};

// Each acknowledged step has its own durable outbox key. A new owner review
// may resume a definite failure, while uncertain sends always retain their key.
export const deliverOrderedReply = async (options) => {
  const { store, draft, reviewed, queue, log } = options;
  const { key } = replyParts(draft);
  const running = active.get(store) ?? new Set();
  active.set(store, running);
  if (running.has(key)) {
    return refused(
      draft,
      'sequence-busy',
      'This reply is already being delivered'
    );
  }
  running.add(key);
  try {
    const state = await orderedReplyState(store, draft);
    const signature = draftConfirmationKey(draft);
    const stop = admission(
      draft,
      state.records,
      signature,
      reviewed,
      state.progress
    );
    if (stop) {
      return stop;
    }
    if (!state.records.some(Boolean)) {
      // Preserve the reviewed overrides before the first external effect.
      await queue();
      await store.flush?.();
    }
    const result = await deliverSteps(options, state, signature);
    if (result.status === 'sent' && !reviewed) {
      await store
        .delete(draft.id)
        .catch((error) =>
          log({ event: 'sent_not_recorded', error: error.message })
        );
    }
    return result;
  } finally {
    running.delete(key);
  }
};
