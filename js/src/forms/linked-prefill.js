import { createHash } from 'node:crypto';
import {
  respondentDestination,
  sameRespondentForm,
} from './form-destination.js';
import { formFailure as failure } from './options.js';

const checkRespondentReport = (target, report) => {
  const resolved = respondentDestination(report.url);
  if (
    !sameRespondentForm(target, resolved) ||
    report.frames.some(
      (frame) =>
        frame.fieldCount > 0 && new URL(frame.url).origin !== resolved.origin
    )
  ) {
    throw failure(
      'question-form-destination',
      'The linked form opened a different responder or an unrelated frame.'
    );
  }
};

const receiptFor = (receipt, result) => {
  const state =
    result.state === 'partial' && !result.ok ? 'unconfirmed' : result.state;
  return {
    ...receipt,
    state,
    written: result.receipts.filter(({ status }) => status === 'applied')
      .length,
    ...(result.code ? { code: result.code } : {}),
  };
};

const newRequestId = ({ source, chat, messageId, url }) =>
  createHash('sha256')
    .update(JSON.stringify([source, chat, messageId, url]))
    .digest('hex');

const findReceipt = (forms, saved, requestId) => {
  const receipt = saved?.receipt;
  if (!receipt?.sessionId) {
    return receipt;
  }
  const session = forms
    .listReviews()
    .sessions.find(({ id }) => id === receipt.sessionId);
  if (!session) {
    const { sessionId: _id, browserSlot: _slot, ...closed } = receipt;
    return {
      ...closed,
      state: ['prefilled', 'partial'].includes(receipt.state)
        ? 'closed'
        : 'unconfirmed',
    };
  }
  if (receipt.state === 'waiting-owner' && !session.prefillState) {
    try {
      return receiptFor(
        receipt,
        forms.prefillStatus({ id: session.id, requestId })
      );
    } catch {
      return { ...receipt, state: 'unconfirmed', code: 'form-prefill-missing' };
    }
  }
  return receipt;
};

const linkedFormRecord = (id, receipt) => ({
  id,
  kind: 'linked-form-prefill',
  tokens: ['linked-form-prefill'],
  receipt,
});

const reserve = async (store, id, base) => {
  try {
    await store.update(id, (current) => {
      if (current) {
        throw failure(
          'question-form-reserved',
          'This linked form already has a review request.'
        );
      }
      return linkedFormRecord(id, {
        ...base,
        state: 'unconfirmed',
        code: 'question-form-interrupted',
      });
    });
    await store.flush?.();
    return true;
  } catch (error) {
    if (error.code !== 'question-form-reserved') {
      throw error;
    }
    return false;
  }
};

const errorCode = (error, fallback) =>
  typeof error?.code === 'string' && error.code.length <= 120
    ? error.code
    : fallback;

const reviewLinkedForm = async ({
  input,
  ownership,
  requestId,
  target,
  base,
  save,
  release,
}) => {
  const { forms, onWaiting } = ownership;
  const { url, planning, signal, verify } = input;
  let session;
  let issued = false;
  let closing;
  const close = () =>
    (closing ??= Promise.resolve().then(() => forms.closeReview(session.id)));
  const abort = () => {
    if (session) {
      void close().catch(() => {});
    }
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    signal.throwIfAborted();
    ({ session } = await forms.openReview({
      url,
      browserSlot: `chat-form-${requestId.slice(0, 20)}`,
    }));
    await verify();
    issued = true;
    const result = await forms.prefillReview(
      {
        id: session.id,
        requestId,
        profileId: planning.profileId,
        approximate: planning.approximate,
        matching: planning.matching,
        salary: planning.salary,
        answerFinalPeriod: planning.answerFinalPeriod,
        modelDraft: planning.modelDraft === true,
      },
      onWaiting,
      (report) => checkRespondentReport(target, report)
    );
    signal.throwIfAborted();
    if (result.code === 'question-form-destination') {
      await close();
      return await save(receiptFor(base, result));
    }
    return await save(
      receiptFor(
        { ...base, sessionId: session.id, browserSlot: session.browserSlot },
        result
      )
    );
  } catch (error) {
    let retained = session;
    let code = errorCode(error, 'question-form-unconfirmed');
    if (session && (signal.aborted || !issued)) {
      try {
        await close();
        retained = null;
      } catch (cleanup) {
        code = errorCode(cleanup, 'form-close-failed');
      }
    }
    signal.throwIfAborted();
    const state = retained ? 'unconfirmed' : 'refused';
    const slot = retained
      ? { sessionId: session.id, browserSlot: session.browserSlot }
      : {};
    const refused = {
      ...base,
      ...slot,
      state,
      code,
    };
    if (!session && code === 'form-session-limit') {
      await release();
      return refused;
    }
    return await save(refused);
  } finally {
    signal.removeEventListener('abort', abort);
  }
};

/** The Forms owner retains the native slot and its request after the chat visit. */
export const createLinkedFormPrefill =
  ({ store, ...ownership }) =>
  async (input) => {
    const { url, messageId, verify } = input;
    const target = respondentDestination(url);
    if (!target) {
      throw failure(
        'question-form-destination',
        'Choose a known questionnaire destination.'
      );
    }
    const requestId = newRequestId(input);
    const id = `secret:linked-form-prefill:${requestId}`;
    const base = { url, messageId, written: 0 };
    await verify();
    const saved = await store.get(id);
    if (saved || !(await reserve(store, id, base))) {
      return (
        findReceipt(
          ownership.forms,
          saved ?? (await store.get(id)),
          requestId
        ) ?? { ...base, state: 'unconfirmed', code: 'question-form-reserved' }
      );
    }
    return reviewLinkedForm({
      input,
      ownership,
      requestId,
      target,
      base,
      save: async (receipt) => {
        await store.put(linkedFormRecord(id, receipt));
        await store.flush?.();
        return receipt;
      },
      release: async () => {
        await store.delete(id);
        await store.flush?.();
      },
    });
  };
