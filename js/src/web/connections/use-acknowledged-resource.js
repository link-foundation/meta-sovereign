import { useEffect, useState } from 'react';

/** Mount read and explicit writes keep the last acknowledged snapshot on failure. */
export const useAcknowledgedResource = (load) => {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    Promise.resolve()
      .then(load)
      .then((answer) => {
        if (alive) {
          if (answer?.ok) {
            setData(answer);
          }
          setError(!answer?.ok);
        }
      })
      .catch(() => {
        if (alive) {
          setError(true);
        }
      })
      .finally(() => {
        if (alive) {
          setBusy(false);
        }
      });
    return () => {
      alive = false;
    };
  }, []);
  const run = async (
    operation,
    merge = (previous, answer) => ({ ...previous, ...answer })
  ) => {
    setBusy(true);
    setError(false);
    try {
      const answer = await operation();
      if (!answer?.ok) {
        throw new Error('unacknowledged operation');
      }
      setData((previous) => merge(previous, answer));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  return { data, busy, error, run };
};
