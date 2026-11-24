import { useEffect, useRef, useState } from 'react';
import {
  confirmedLinkedinPositionJob,
  confirmedLinkedinPositionReview,
  linkedinPositionHash,
  linkedinPositionPending,
} from '../cv/linkedin-position-receipt.js';
import { PrivateCvJobState } from './private-cv-job-state.js';

const selectionKey = 'meta-sovereign:linkedin-position-review';
const selectedFingerprint = () => {
  try {
    const value = globalThis.sessionStorage?.getItem(selectionKey) ?? '';
    return linkedinPositionHash.test(value) ? value : null;
  } catch {
    return null;
  }
};
const remember = (fingerprint) => {
  try {
    globalThis.sessionStorage?.setItem(selectionKey, fingerprint);
  } catch {
    // The server retains acknowledged reviews when browser storage is disabled.
  }
};

const usePositionJob = (api, fingerprint) => {
  const controller = useRef(null);
  const [snapshot, setSnapshot] = useState(null);
  useEffect(() => {
    if (!fingerprint) {
      return;
    }
    const job = new PrivateCvJobState(api, setSnapshot, {
      initial: { fingerprint },
      fields: ['fingerprint'],
      prefix: 'cvLinkedinPosition',
      pendingKey: `${selectionKey}:${fingerprint}`,
      checked: (row, id) => confirmedLinkedinPositionJob(row, id, fingerprint),
      running: linkedinPositionPending,
    });
    controller.current = job;
    setSnapshot(job.state);
    if (job.state.attempted) {
      void job.refresh();
    }
    return () => {
      controller.current = null;
      job.dispose();
    };
  }, [api, fingerprint]);
  return {
    job: fingerprint && snapshot?.fingerprint === fingerprint ? snapshot : null,
    start: () => controller.current?.mutate('Start'),
    decide: (decision) =>
      controller.current?.mutate('Decide', { fingerprint, decision }),
    stop: () => controller.current?.mutate('Stop'),
    refresh: () => controller.current?.refresh(),
    reset: () => controller.current?.newRequest(),
  };
};

export const useLinkedinPositionReview = (api) => {
  const [fingerprint, setFingerprint] = useState(selectedFingerprint);
  const [receipt, setReceipt] = useState(null);
  const [operation, setOperation] = useState(null);
  const [error, setError] = useState(null);
  const [retry, setRetry] = useState(0);
  const [focus, setFocus] = useState(0);
  const mounted = useRef(false);
  const working = useRef(false);
  const review = fingerprint === receipt?.fingerprint ? receipt : null;
  const actions = usePositionJob(
    api,
    review?.phase === 'reviewed' ? fingerprint : null
  );
  const { job } = actions;
  const loading = Boolean(fingerprint && !review && !error);
  const locked = Boolean(
    operation ||
    loading ||
    job?.busy ||
    job?.unknown ||
    linkedinPositionPending(job?.row)
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!fingerprint || review) {
      return;
    }
    let current = true;
    void Promise.resolve()
      .then(() => api.cvLinkedinPositionStored({ fingerprint }))
      .then((row) =>
        confirmedLinkedinPositionReview(
          row,
          (item) => item.fingerprint === fingerprint
        )
      )
      .then((row) => {
        if (current) {
          setReceipt(row);
        }
      })
      .catch(() => {
        if (current) {
          setError('recover');
        }
      });
    return () => {
      current = false;
    };
  }, [api, fingerprint, retry, review]);

  const change = async (name, load) => {
    if (locked || working.current) {
      return;
    }
    working.current = true;
    setError(null);
    setOperation(name);
    try {
      const row = await load();
      if (mounted.current) {
        setReceipt(row);
        setFingerprint(row.fingerprint);
        remember(row.fingerprint);
      }
    } catch (failure) {
      if (mounted.current) {
        setError(failure.code ?? 'unconfirmed');
      }
    } finally {
      working.current = false;
      if (mounted.current) {
        setOperation(null);
        if (name === 'stage') {
          setFocus((value) => value + 1);
        }
      }
    }
  };

  const stage = (experience) =>
    change('stage', async () => {
      const staged = await confirmedLinkedinPositionReview(
        await api.cvLinkedinPositionStage(experience),
        ({ phase, experience: selected }) =>
          phase === 'draft' &&
          Object.entries(experience).every(
            ([key, value]) => selected?.[key] === value
          )
      );
      return review?.draftFingerprint === staged.fingerprint ? review : staged;
    });
  const approve = () =>
    change('approve', async () =>
      confirmedLinkedinPositionReview(
        await api.cvLinkedinPositionReview({ fingerprint }),
        (row) =>
          row.phase === 'reviewed' && row.draftFingerprint === fingerprint
      )
    );

  return {
    ...actions,
    review,
    stage,
    approve,
    error,
    loading,
    operation,
    locked,
    focus,
    retry: () => {
      setError(null);
      setRetry((value) => value + 1);
    },
  };
};
