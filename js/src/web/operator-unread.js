import { useEffect, useRef, useState } from 'react';
import { unreadCount } from './chat-model.js';
import { needsAttention } from './operator-model.js';

const candidateOf = ({ state, queue }, skipped) => {
  const active = state.current;
  return active && needsAttention(active) && !skipped.has(active.key)
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
export const useOperatorUnread = (api, state, queue) => {
  const latest = useRef({ state, queue });
  latest.current = { state, queue };
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(null);
  const [verified, setVerified] = useState(null);
  const [retry, setRetry] = useState(0);
  const current = state.current;
  const first = queue[0]?.key;
  const valid = current && needsAttention(current) && verified === current.key;
  useEffect(() => {
    if (valid) {
      return undefined;
    }
    if (current && !needsAttention(current)) {
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
        const answer = await checkCandidate(api, next);
        if (stopped) {
          return;
        }
        if (answer?.read) {
          latest.current.state.addLinks([answer.read]);
        }
        if (answer.unread) {
          setVerified(next.key);
          latest.current.state.select(next.key);
          break;
        }
        skipped.add(next.key);
      }
    };
    check()
      .catch((failure) => !stopped && setError(failure))
      .finally(() => !stopped && setChecking(false));
    return () => {
      stopped = true;
    };
  }, [api, valid, current?.key, first, retry]);
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
