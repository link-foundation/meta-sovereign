import { useEffect, useRef, useState } from 'react';

export const useCvSaveWatch = ({ api, values, run }) => {
  const browserSlot = values.browserSlot;
  const [watch, setWatch] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [loadError, setLoadError] = useState(true);
  const [duration, setDuration] = useState('15');
  const generation = useRef(0);
  const saved = useRef(-1);
  const reads = useRef(0);
  const recover = async (current, operation) => {
    if (current === generation.current) {
      reads.current++;
    }
    try {
      return await operation();
    } catch (error) {
      if (current === generation.current) {
        setLoadError(true);
      }
      throw error;
    } finally {
      if (current === generation.current) {
        reads.current++;
      }
    }
  };
  const load = async (current, force = false, requestId) => {
    const revision = ++reads.current;
    const answer = await api.vacancyCvWatchStatus({
      browserSlot,
      ...(requestId ? { requestId } : {}),
    });
    const changed = force || saved.current !== (answer.watch?.saves ?? 0);
    const data = changed ? await api.vacancyCvSnapshots({ browserSlot }) : null;
    if (current === generation.current && revision === reads.current) {
      setWatch(answer.watch);
      if (data) {
        setSnapshots(data.snapshots);
      }
      saved.current = answer.watch?.saves ?? 0;
      setLoadError(false);
    }
    return answer;
  };
  useEffect(() => {
    const current = ++generation.current;
    setWatch(null);
    setSnapshots([]);
    setLoadError(true);
    saved.current = -1;
    void load(current, true).catch(() => {
      if (current === generation.current) {
        setLoadError(true);
      }
    });
    return () => {
      generation.current++;
    };
  }, [api, browserSlot]);
  useEffect(() => {
    if (!watch?.active) {
      return;
    }
    const current = generation.current;
    let stopped = false;
    let timer;
    const poll = async () => {
      try {
        await load(current);
      } catch {
        if (current === generation.current) {
          setLoadError(true);
        }
      }
      if (!stopped) {
        timer = globalThis.setTimeout(poll, 1000);
      }
    };
    timer = globalThis.setTimeout(poll, 1000);
    return () => {
      stopped = true;
      globalThis.clearTimeout(timer);
    };
  }, [api, browserSlot, watch?.active]);
  return {
    watch,
    snapshots,
    loadError,
    duration,
    setDuration,
    start: () =>
      run('cv-watch', async () => {
        const current = generation.current;
        const answer = await recover(current, () =>
          api.vacancyCvWatch({
            browserSlot,
            requestId: globalThis.crypto.randomUUID(),
            durationMs: Number(duration) * 60000,
          })
        );
        if (current === generation.current) {
          setWatch(answer.watch);
          setLoadError(false);
        }
        return answer;
      }),
    stop: () =>
      run('cv-watch-stop', async () => {
        const current = generation.current;
        await recover(current, () =>
          api.vacancyCvWatchStop({
            browserSlot,
            requestId: watch.requestId,
          })
        );
        return load(current, true, watch.requestId);
      }),
    reload: () => run('cv-watch-reload', () => load(generation.current, true)),
  };
};
