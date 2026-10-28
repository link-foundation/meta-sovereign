import { useEffect, useRef, useState } from 'react';
import { unreadCount } from './chat-model.js';
import { retainOperatorWork } from './operator-work.js';
import { traceClient } from './client-log.js';

const candidateOf = ({ state, queue }, skipped) => {
  const active = state.current;
  return active &&
    queue.some((chat) => chat.key === active.key) &&
    !skipped.has(active.key)
    ? active
    : queue.find((chat) => !skipped.has(chat.key));
};
const checkCandidate = async (api, next) => {
  const answer =
    next.source === 'telegram' && api.telegramDialogState
      ? await api.telegramDialogState({ chat: next.chat })
      : { supported: false };
  if (!answer || (answer.supported !== false && !answer.ok)) {
    throw new Error(answer?.error ?? 'Unable to check unread messages');
  }
  return {
    read: answer.read,
    unread: answer.supported === false || unreadCount([], answer.read) > 0,
  };
};

/** Validate a candidate before opening it; merely inspecting it never reads it. */
export const useOperatorUnread = (api, state, queue, work) => {
  const latest = useRef({ state, queue, work });
  latest.current = { state, queue, work };
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(null);
  const [verified, setVerified] = useState(null);
  const [retry, setRetry] = useState(0);
  const current = state.current;
  const first = queue[0]?.key;
  const eligible = current && queue.some((chat) => chat.key === current.key);
  const valid = eligible && verified === current.key;
  useEffect(() => {
    if (state.loading || valid) {
      return undefined;
    }
    if (current && !eligible) {
      state.select('');
    }
    if (!first) {
      setChecking(false);
      return undefined;
    }
    let stopped = false;
    setChecking(true);
    setError(null);
    const check = async () => {
      const skipped = new Set();
      while (!stopped) {
        const next = candidateOf(latest.current, skipped);
        if (!next) {
          break;
        }
        traceClient(api, 'operator_candidate', {
          chat: next.chat,
          unread: next.unread,
          retained: Boolean(latest.current.work[next.key]),
        });
        const answer = latest.current.work[next.key]
          ? { unread: true }
          : await checkCandidate(api, next);
        if (stopped) {
          return;
        }
        if (answer?.read) {
          latest.current.state.addLinks([answer.read]);
        }
        if (answer.unread) {
          retainOperatorWork(next);
          traceClient(api, 'operator_opened', {
            chat: next.chat,
            unread: next.unread,
          });
          setVerified(next.key);
          latest.current.state.select(next.key);
          break;
        }
        skipped.add(next.key);
        traceClient(api, 'operator_skip_read', { chat: next.chat, unread: 0 });
      }
    };
    check()
      .catch((failure) => !stopped && setError(failure))
      .finally(() => !stopped && setChecking(false));
    return () => {
      stopped = true;
    };
  }, [api, state.loading, valid, eligible, current?.key, first, retry]);
  useEffect(() => {
    if (!error) {
      return undefined;
    }
    const timer = globalThis.setTimeout(
      () => setRetry((value) => value + 1),
      5000
    );
    return () => globalThis.clearTimeout(timer);
  }, [error]);
  return {
    current: valid ? current : null,
    checking,
    error,
    retry: () => setRetry((value) => value + 1),
  };
};
