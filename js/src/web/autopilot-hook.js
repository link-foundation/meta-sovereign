/**
 * Shared autopilot state (R-Y87): the core hook used by both the chat
 * screen and the automations page to start, stop, monitor, and watch
 * each automation's autopilot run.
 */

import { useEffect, useMemo, useState } from 'react';

const AUTOPILOT_PREFIX = 'automation-autopilot:';
const AUTOPILOT_POLL_MS = 3000;
const SECOND_MS = 1000;

const newer = (a, b) =>
  String(a?.updatedAt ?? '') >= String(b?.updatedAt ?? '') ? a : b;

/** The autopilot to show: one that is on, else the latest to finish. */
export const shownAutopilot = (states = [], dismissed = null) => {
  const on = states.filter((s) => s?.on);
  if (on.length > 0) {
    return on.reduce(newer);
  }
  const last = states.length > 0 ? states.reduce(newer) : null;
  return last && last.updatedAt !== dismissed && last.status !== 'stopped'
    ? last
    : null;
};

/**
 * Core autopilot state: fetches all states on mount and on `tick`, merges
 * streamed updates from `links`, polls every few seconds while one is on
 * and the event stream (`live`) is down. Also provides `stateFor(id)` for
 * per-automation controls on the automations page.
 */
export const useAutopilotBase = ({
  api,
  tick,
  confirm,
  t,
  links = null,
  live = false,
}) => {
  const [fetched, setFetched] = useState([]);
  const [dismissed, setDismissed] = useState(null);
  const [dismissedIds, setDismissedIds] = useState(() => new Set());
  const streamed = useMemo(
    () => (links ?? []).filter((l) => l?.id?.startsWith(AUTOPILOT_PREFIX)),
    [links]
  );
  const states = useMemo(() => {
    const byId = new Map(fetched.map((s) => [s.id, s]));
    for (const s of streamed) {
      byId.set(s.id, newer(s, byId.get(s.id)));
    }
    return [...byId.values()];
  }, [fetched, streamed]);
  const shown = shownAutopilot(states, dismissed);
  const read = () =>
    Promise.resolve(api.autopilots?.())
      .then((next) => Array.isArray(next) && setFetched(next))
      .catch(() => {});
  useEffect(() => {
    read();
  }, [api, tick]);
  useEffect(() => {
    if (live || !shown?.on) {
      return undefined;
    }
    const timer = globalThis.setInterval(read, AUTOPILOT_POLL_MS);
    return () => globalThis.clearInterval(timer);
  }, [live, shown?.on]);
  const change = async (body) => {
    const answer = await api.autopilot?.(body);
    if (answer?.id) {
      setFetched((all) => [...all.filter((s) => s.id !== answer.id), answer]);
    }
    return answer;
  };
  /** State for a specific automation's autopilot row; null if not shown. */
  const stateFor = (automationId) => {
    const s = states.find((st) => st.automation === automationId);
    if (!s || s.status === 'stopped') {
      return null;
    }
    if (!s.on && dismissedIds.has(s.id)) {
      return null;
    }
    return s;
  };
  return {
    states,
    shown,
    stateFor,
    start: (automation) =>
      change({
        automation,
        on: true,
        monitor: true,
        ask: (answer) =>
          confirm(
            t('chat.autopilot.confirm', {
              name: answer.preview?.name ?? '',
              count: answer.preview?.total ?? 0,
              min: Math.round(
                (answer.preview?.pacing?.minDelayMs ?? 0) / SECOND_MS
              ),
              max: Math.round(
                (answer.preview?.pacing?.maxDelayMs ?? 0) / SECOND_MS
              ),
              cap: answer.preview?.pacing?.dailyCap ?? 0,
            })
          ),
      }),
    stop: (automation) => change({ automation, on: false }),
    monitor: (automation, on) => change({ automation, monitor: on }),
    dismiss: () => setDismissed(shown?.updatedAt ?? null),
    dismissOne: (id) => setDismissedIds((prev) => new Set([...prev, id])),
  };
};
