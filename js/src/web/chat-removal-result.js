import { useRef, useState } from 'react';

const uncertain = new Set([
  'outcome-unknown',
  'history-outcome-unknown',
  'history-incomplete',
]);
export const removalError = (t, answer) =>
  t(
    answer?.membership === 'confirmed'
      ? 'chat.removal.historyPartial'
      : uncertain.has(answer?.code)
        ? 'chat.removal.unknown'
        : 'chat.removal.failed'
  );

/** Consume the button synchronously; a lost response cannot offer a replay. */
export const useRemovalConfirm = (confirm, done) => {
  const active = useRef(false);
  const blocked = useRef(false);
  const [state, setState] = useState({ busy: false, result: null });
  const run = async (request) => {
    if (active.current || blocked.current) {
      return;
    }
    active.current = true;
    setState({ busy: true, result: null });
    let answer;
    try {
      answer = await confirm(request);
    } catch {
      answer = null;
    }
    if (
      !answer ||
      typeof answer.ok !== 'boolean' ||
      (answer.ok && (answer.code || answer.error))
    ) {
      answer = { ok: false, code: 'outcome-unknown' };
    }
    blocked.current =
      uncertain.has(answer.code) || answer.membership === 'confirmed';
    setState({ busy: false, result: answer });
    active.current = false;
    if (answer.ok === true) {
      done();
    }
  };
  return { ...state, blocked: blocked.current, run };
};

/** Only explicit, unique receipts for requested channels can remove rows. */
const validLeaves = (answer, requested) =>
  typeof answer?.ok === 'boolean' &&
  !(answer.ok && (answer.code || answer.error)) &&
  Array.isArray(answer.left) &&
  answer.left.every((id) => requested.includes(id)) &&
  new Set(answer.left).size === answer.left.length;
export const inactiveLeaveOutcome = (answer, requested) => {
  const valid = validLeaves(answer, requested);
  const left = valid ? answer.left : [];
  const remaining = requested.filter((id) => !left.includes(id));
  const unknown =
    !valid ||
    typeof answer.ok !== 'boolean' ||
    answer.code === 'outcome-unknown' ||
    (answer.ok === true && remaining.length > 0);
  return {
    left,
    remaining,
    complete: valid && answer.ok === true && remaining.length === 0,
    blocked: unknown ? remaining : [],
    unknown,
  };
};
