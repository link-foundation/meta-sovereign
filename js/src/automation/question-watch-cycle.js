import { previewAnswer } from './question-store.js';
import { browserQuestionInput } from './question-browser-vacancy.js';
import { guardedSend } from './outbox.js';
import { questionChoiceKey } from './question-choice-key.js';
import { approvedBrowserPlan as approved } from './question-browser-plan.js';
import { tickQuestionNotices } from './question-notice-watch.js';
import {
  browserChoiceDraft,
  checkedBrowserChoiceReceipt,
  checkBrowserQuestion,
} from './question-browser-state.js';
import {
  questionWatchFailure,
  saveQuestionWatch,
} from './question-watch-records.js';

const questionPlan = ({ store }, record, snapshot) =>
  previewAnswer(
    store,
    browserQuestionInput(record.target, snapshot, {
      ...record.planning,
      modelDraft: false,
    })
  );
const choiceDraft = (runtime, snapshot, plan) =>
  browserChoiceDraft({ target: runtime.record.target, snapshot }, plan.option);

const selectionPhase = (delivered, marked, uncertain) => {
  if (delivered) {
    return marked ? 'marked-sent' : 'sent';
  }
  return uncertain ? 'unknown' : 'failed';
};

const outcomePatch = (outcome, draft) => {
  const outbox = outcome.outbox ?? null;
  const delivered =
    outcome.status === 'sent' || outcome.code === 'already-sent';
  const marked = outbox?.resolvedBy === 'user';
  if (delivered && !marked) {
    checkedBrowserChoiceReceipt(outbox?.receipt, {
      ...draft,
      text: outbox?.receipt?.option,
    });
  }
  const uncertain =
    outcome.status === 'unknown' || outcome.code === 'send-in-doubt';
  return {
    selection: {
      chat: draft.chat,
      option: outbox?.receipt?.option ?? draft.text,
      key: questionChoiceKey(draft),
    },
    phase: selectionPhase(delivered, marked, uncertain),
    outbox,
    ...(!delivered
      ? { state: 'paused', reason: outcome.code ?? 'selection-refused' }
      : {}),
  };
};

const act = async (context, runtime, snapshot, plan, planning) => {
  const record = { ...runtime.record, planning };
  const verify = async () => {
    const latest = await questionPlan(context, record, snapshot);
    if (
      !runtime.fresh() ||
      !approved(latest) ||
      latest.text !== plan.text ||
      latest.option !== plan.option
    ) {
      throw questionWatchFailure('question-watch-plan-changed');
    }
  };
  if (!snapshot.strictOptions) {
    const result = await runtime.handle.prefill(
      { ...snapshot, recent: planning.recent },
      plan.text,
      verify
    );
    if (result?.prefilled !== true) {
      throw questionWatchFailure('question-browser-prefill-unconfirmed');
    }
    return { phase: 'prefilled' };
  }
  const draft = choiceDraft(runtime, snapshot, plan);
  await saveQuestionWatch(context, runtime, {
    phase: 'selecting',
    selection: {
      chat: draft.chat,
      option: draft.text,
      key: questionChoiceKey(draft),
    },
  });
  return outcomePatch(
    await guardedSend({
      store: context.store,
      owner: runtime.record.id,
      kind: 'question-choice',
      key: questionChoiceKey(draft),
      draft,
      clock: context.clock,
      log: context.log,
      send: async (selected) => {
        await verify();
        return checkedBrowserChoiceReceipt(
          await runtime.handle.select(selected, verify, planning.recent),
          selected
        );
      },
    }),
    draft
  );
};

const phaseOf = (snapshot, plan) => {
  if (snapshot.question.outgoing) {
    return 'waiting';
  }
  if (snapshot.hasDraft) {
    return 'owner-draft';
  }
  if (plan?.pending?.blocked || plan?.pending?.limited) {
    return 'review';
  }
  if (snapshot.strictOptions && !snapshot.answerOptions.length) {
    return 'pending-options';
  }
  return approved(plan) ? 'ready' : 'review';
};

const alreadySelected = (phase, snapshot, previous, runtime, plan) =>
  phase === 'ready' &&
  snapshot.strictOptions &&
  previous?.status === 'sent' &&
  previous.key === questionChoiceKey(choiceDraft(runtime, snapshot, plan));

const tick = async (context, runtime) => {
  if (!runtime.fresh()) {
    await saveQuestionWatch(context, runtime, {
      state: 'stopped',
      reason: runtime.stopping ? 'owner-stopped' : 'expired',
    });
    return;
  }
  if (runtime.record.noticeReplies) {
    return tickQuestionNotices(context, runtime);
  }
  const observed = await runtime.handle.read();
  const snapshot = checkBrowserQuestion(observed);
  const planning = {
    ...runtime.record.planning,
    ...(await context.answerPlanning(
      runtime.record.planning,
      observed,
      runtime.record.target,
      { signal: runtime.controller.signal }
    )),
  };
  const record = { ...runtime.record, planning };
  const plan = snapshot.question.outgoing
    ? null
    : await questionPlan(context, record, snapshot);
  let phase = phaseOf(snapshot, plan);
  const previous = runtime.record.outbox;
  if (alreadySelected(phase, snapshot, previous, runtime, plan)) {
    phase = previous.resolvedBy === 'user' ? 'marked-sent' : 'sent';
  }
  await saveQuestionWatch(context, runtime, {
    last: { snapshot, plan },
    phase,
  });
  if (phase !== 'ready' || !runtime.fresh()) {
    return;
  }
  const latest = await questionPlan(context, record, snapshot);
  if (
    !approved(latest) ||
    latest.text !== plan.text ||
    latest.option !== plan.option
  ) {
    await saveQuestionWatch(context, runtime, { phase: 'review' });
    return;
  }
  await saveQuestionWatch(
    context,
    runtime,
    await act(context, runtime, snapshot, latest, planning)
  );
};

/** One sequential polling loop. Stop closes admission before draining the action. */
export const createQuestionWatchCycle = (context, runtime, release) => {
  const cycle = async () => {
    try {
      await tick(context, runtime);
    } catch (error) {
      runtime.stopping = true;
      await saveQuestionWatch(context, runtime, {
        state: 'paused',
        reason: error.code ?? 'question-watch-failed',
      });
    } finally {
      if (runtime.fresh() && runtime.record.state === 'active') {
        runtime.timer = globalThis.setTimeout(() => {
          runtime.pending = cycle();
          runtime.pending.catch(() => {});
        }, context.intervalMs);
      } else {
        try {
          if (runtime.record.state === 'active' && !runtime.stopping) {
            await saveQuestionWatch(context, runtime, {
              state: 'stopped',
              reason: 'expired',
            });
          }
        } finally {
          await release();
        }
      }
    }
  };
  return {
    run() {
      runtime.pending = cycle();
      runtime.pending.catch(() => {});
    },
    async stop() {
      runtime.stopping = true;
      runtime.controller?.abort();
      globalThis.clearTimeout(runtime.timer);
      try {
        await runtime.pending;
        await saveQuestionWatch(context, runtime, {
          state: 'stopped',
          reason: 'owner-stopped',
        });
      } finally {
        await release();
      }
    },
  };
};
