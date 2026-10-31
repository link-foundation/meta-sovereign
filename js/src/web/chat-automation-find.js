import { useEffect, useRef } from 'react';
import { traceClient } from './client-log.js';
import { activeAccount } from './telegram-account-scope.js';

const address = (chat) => ({ source: chat.source, chat: String(chat.chat) });
const keyOf = (chat) => `${chat.source}:${chat.chat}`;
const failureNotice = (result) => ({
  kind: 'failed',
  code: result?.code,
  error: result?.error ?? result?.message ?? 'no-answer',
});
const findResult = (result, isFailure) => {
  const failed = Boolean(isFailure(result));
  return {
    found: Boolean(result?.draft),
    failed,
    level: failed ? 'warn' : 'debug',
    code: failed ? (result?.code ?? 'lookup-failed') : undefined,
  };
};

// Inspect real eligibility through the same planner used by Run, without
// queuing drafts or delivering messages, including for automatic automations.
export const useFindMatchingChat = ({
  api,
  current,
  show,
  after,
  latest,
  pending,
  setRunning,
  setOpen,
  isFailure,
}) => {
  const searches = useRef(new Map());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    searches.current.clear();
    return () => {
      mounted.current = false;
    };
  }, [api]);
  return async (automation) => {
    if (pending.current || !current) {
      return null;
    }
    const target = current;
    const account = activeAccount();
    const searchKey = `${account}:${automation.id}`;
    const stillHere = () =>
      mounted.current &&
      activeAccount() === account &&
      latest.current?.key === target.key;
    const signature = JSON.stringify(automation);
    const previous = searches.current.get(searchKey);
    const visited = new Map(
      previous?.signature === signature ? previous.visited : []
    );
    visited.set(keyOf(target), address(target));
    const trace = {
      automation: automation.id,
      ...address(target),
      excluded: visited.size,
    };
    pending.current = true;
    const started = Date.now();
    setRunning({ id: automation.id, kind: 'find' });
    traceClient(api, 'automation_find_start', trace);
    try {
      const result = await api.nextDraft({
        automation: automation.id,
        exclude: [...visited.values()],
        queue: false,
      });
      traceClient(api, 'automation_find_result', {
        ...trace,
        ...findResult(result, isFailure),
        durationMs: Date.now() - started,
      });
      if (!stillHere()) {
        return result;
      }
      if (isFailure(result)) {
        after(failureNotice(result));
      } else if (!result.draft) {
        searches.current.delete(searchKey);
        after({ kind: 'no-matching-chat', name: automation.name });
      } else {
        const found = address(result.draft);
        visited.set(keyOf(found), found);
        searches.current.set(searchKey, { signature, visited });
        after(null);
        setOpen(false);
        show(found);
      }
      return result;
    } catch (error) {
      traceClient(api, 'automation_find_error', {
        ...trace,
        code: error?.code ?? 'internal',
        durationMs: Date.now() - started,
      });
      if (stillHere()) {
        after(failureNotice(error));
      }
      return null;
    } finally {
      pending.current = false;
      setRunning(null);
    }
  };
};
