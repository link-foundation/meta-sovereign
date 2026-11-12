import { useEffect, useRef, useState } from 'react';

export const useCvPreparation = ({ api, values, run }) => {
  const [preparation, setPreparation] = useState(null);
  const [ready, setReady] = useState(false);
  const [pendingId, setPendingId] = useState(null);
  const pending = useRef(null);
  const permitted = useRef(false);
  const generation = useRef(0);
  const revision = useRef(0);
  const browserSlot = values.browserSlot;
  const key = `meta-sovereign:cv-preparation:${browserSlot}`;
  const accept = (answer, requestId) => {
    const terminal = !['starting', 'opening', 'preparing'].includes(
      answer.preparation?.state
    );
    const known = !requestId || Boolean(answer.preparation);
    setPreparation(answer.preparation);
    permitted.current = terminal && known;
    setReady(permitted.current);
    if (answer.preparation && terminal) {
      globalThis.localStorage?.removeItem(key);
      pending.current = null;
      setPendingId(null);
    }
  };
  const load = async (requestId) => {
    const current = generation.current;
    const read = ++revision.current;
    const answer = await api.vacancyCvPrepareStatus({
      browserSlot,
      ...(requestId ? { requestId } : {}),
    });
    if (current === generation.current && read === revision.current) {
      accept(answer, requestId);
    }
    return answer;
  };
  useEffect(() => {
    generation.current++;
    setPreparation(null);
    setReady(false);
    permitted.current = false;
    try {
      pending.current = globalThis.localStorage?.getItem(key) ?? null;
      setPendingId(pending.current);
      void load(pending.current).catch(() => {});
    } catch {
      // Recovery stays blocked if the pending durable intent cannot be read.
    }
    return () => {
      generation.current++;
    };
  }, [api, browserSlot]);
  return {
    preparation,
    ready,
    cancellable: Boolean(pendingId) && !ready,
    prepare: (review, change) =>
      run('cv-prepare', async () => {
        if (!permitted.current) {
          throw new Error('jobs-cv-recovery');
        }
        const current = generation.current;
        const requestId = globalThis.crypto.randomUUID();
        if (!globalThis.localStorage) {
          throw new Error('jobs-cv-recovery');
        }
        globalThis.localStorage.setItem(key, requestId);
        revision.current++;
        permitted.current = false;
        setReady(false);
        pending.current = requestId;
        setPendingId(requestId);
        const answer = await api.vacancyCvPrepare({
          browserSlot,
          requestId,
          fingerprint: review.fingerprint,
          changeId: change.id,
        });
        if (current === generation.current) {
          accept(answer, requestId);
        }
        return answer;
      }),
    reload: () => run('cv-prepare-status', () => load(pending.current)),
    cancel: () =>
      run('cv-prepare-cancel', async () => {
        const requestId = pending.current;
        if (!requestId) {
          throw new Error('jobs-cv-recovery');
        }
        const current = generation.current;
        const read = ++revision.current;
        const answer = await api.vacancyCvPrepareCancel({
          browserSlot,
          requestId,
        });
        if (current === generation.current && read === revision.current) {
          accept(answer, requestId);
        }
        return answer;
      }),
  };
};
