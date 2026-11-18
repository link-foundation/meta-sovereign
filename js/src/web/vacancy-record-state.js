import { useEffect, useRef, useState } from 'react';

export const useVacancyRecords = ({ api, values, run, adapter }) => {
  const browserSlot = values.browserSlot;
  const [snapshot, setSnapshot] = useState(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const owner = useRef(null);
  const sequence = useRef(0);
  const load = async () => {
    const captured = owner.current;
    const request = ++sequence.current;
    setReady(false);
    try {
      const answer = await api[adapter.read]({ browserSlot });
      if (owner.current === captured && sequence.current === request) {
        setSnapshot(answer);
        setFailed(false);
        setReady(true);
      }
      return answer;
    } catch (error) {
      if (owner.current === captured && sequence.current === request) {
        setFailed(true);
      }
      throw error;
    }
  };
  useEffect(() => {
    const captured = {};
    owner.current = captured;
    setReady(false);
    setFailed(false);
    void load().catch(() => {});
    return () => {
      if (owner.current === captured) {
        owner.current = null;
      }
    };
  }, [api, browserSlot, adapter]);
  const current = snapshot?.browserSlot === browserSlot ? snapshot : null;
  const change = (input) =>
    run(adapter.writeOperation, async () => {
      if (!ready || !current) {
        throw new Error(adapter.reloadError);
      }
      const captured = owner.current;
      sequence.current++;
      setReady(false);
      try {
        const answer = await adapter.write(
          api,
          { browserSlot, revision: current.revision },
          input
        );
        if (owner.current === captured) {
          setSnapshot(answer);
          setFailed(false);
          setReady(true);
        }
        return answer;
      } catch (error) {
        // An uncertain write or conflict requires a fresh observed revision.
        if (owner.current === captured) {
          setFailed(true);
        }
        throw error;
      }
    });
  return {
    snapshot: current,
    ready: ready && Boolean(current),
    failed,
    change,
    reload: () => run(adapter.readOperation, load),
  };
};
