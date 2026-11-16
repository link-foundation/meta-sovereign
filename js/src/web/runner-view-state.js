/** Last observations cannot authorize another action while stale or pending. */
export const canRunnerAction = ({ answer, busy, error }, action, mode) => {
  if (busy || error || !answer || !['local', 'server'].includes(mode)) {
    return false;
  }
  const state = answer.states[mode];
  if (action === 'inspect') {
    return state !== 'unconfigured';
  }
  if (action === 'stop') {
    return state === 'running';
  }
  return (
    action === 'start' &&
    !['runner-profile-change-blocked', 'runner-profile-unavailable'].includes(
      answer.code
    ) &&
    ['stopped', 'running'].includes(state) &&
    ['stopped', 'running', 'unconfigured'].includes(
      answer.states[mode === 'local' ? 'server' : 'local']
    )
  );
};

const retainedInspection = (state, answer) =>
  state.inspection &&
  answer.states[state.inspection.mode] ===
    state.answer?.states[state.inspection.mode] &&
  answer.code === state.answer?.code
    ? state.inspection
    : null;

const actionFeedback = (state, answer, action, mode, id) => {
  if (['start', 'stop'].includes(action)) {
    const confirmed = runnerReceipt(answer, action, mode);
    return confirmed.ok
      ? { id, action, mode, state: confirmed.states[mode] }
      : null;
  }
  return action === 'status' &&
    answer.ok &&
    !answer.code &&
    ['local', 'server'].every(
      (target) => answer.states[target] === state.answer?.states[target]
    )
    ? state.feedback
    : null;
};

/** One owned request; recovery observes state and never replays a mutation. */
export const followRunnerSessions = ({
  request,
  update,
  intervalMs = 5000,
  clock = globalThis,
}) => {
  const owner = new AbortController();
  let state = {
    answer: null,
    busy: false,
    error: false,
    notice: null,
    feedback: null,
  };
  let active = false;
  let failures = 0;
  let feedbackId = 0;
  let timer;
  const publish = (patch) => {
    if (!owner.signal.aborted) {
      state = { ...state, ...patch };
      update(state);
    }
  };
  const perform = async (action, mode) => {
    if (active || owner.signal.aborted) {
      return;
    }
    active = true;
    clock.clearTimeout(timer);
    publish({
      busy: true,
      pending: action,
      ...(action === 'status' ? {} : { inspection: null, feedback: null }),
    });
    try {
      const answer = await request(action, mode, owner.signal);
      failures = 0;
      publish({
        feedback: actionFeedback(
          state,
          answer,
          action,
          mode,
          ['start', 'stop'].includes(action) ? ++feedbackId : feedbackId
        ),
        answer,
        ...(action === 'inspect'
          ? { inspection: { ...answer.application, checkedAt: Date.now() } }
          : { inspection: retainedInspection(state, answer) }),
        error: false,
        notice: action === 'status' ? state.notice : (answer.code ?? null),
      });
    } catch {
      failures++;
      publish({
        error: true,
        feedback: null,
        notice: action === 'status' ? state.notice : 'actionNotConfirmed',
      });
    } finally {
      active = false;
      publish({ busy: false, pending: null });
      if (!owner.signal.aborted) {
        timer = clock.setTimeout(
          () => void perform('status'),
          Math.min(30000, intervalMs * 2 ** Math.min(failures, 3))
        );
      }
    }
  };
  void perform('status');
  return {
    refresh: () => perform('status'),
    act: (action, mode) =>
      canRunnerAction(state, action, mode)
        ? perform(action, mode)
        : Promise.resolve(),
    close: () => {
      owner.abort();
      clock.clearTimeout(timer);
    },
  };
};
import { runnerReceipt } from '../transport/runner-receipt.js';
