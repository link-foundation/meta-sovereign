import { useEffect, useRef, useState } from 'react';
import { PrivateCvJobState } from './private-cv-job-state.js';
import {
  confirmedHhWorkplaceJob,
  hhExperienceWorkplaceRunning,
} from '../cv/experience-hh-workplace-receipt.js';

const handoffKey = 'meta-sovereign:experience-workplace-review';
const restoredHandoff = () => {
  try {
    const saved = JSON.parse(
      globalThis.sessionStorage?.getItem(handoffKey) ?? 'null'
    );
    if (
      typeof saved?.browserSlot === 'string' &&
      /^[a-f\d]{64}$/u.test(saved.fingerprint)
    ) {
      return saved;
    }
  } catch {
    // The same immutable draft can be recovered from the completed plan.
  }
  return null;
};

export const useExperienceWorkplaceHandoff = () => {
  const [handoff, setHandoff] = useState(restoredHandoff);
  useEffect(() => {
    try {
      if (handoff) {
        globalThis.sessionStorage?.setItem(handoffKey, JSON.stringify(handoff));
      } else {
        globalThis.sessionStorage?.removeItem(handoffKey);
      }
    } catch {
      // Storage may be disabled. The confirmed draft remains on the server.
    }
  }, [handoff]);
  const select = ({ browserSlot, fingerprint, previousFingerprint }) =>
    setHandoff((old) => {
      const draftFingerprint = previousFingerprint ?? fingerprint;
      if (old?.draftFingerprint === draftFingerprint && !previousFingerprint) {
        return old;
      }
      if (previousFingerprint && old?.fingerprint !== previousFingerprint) {
        return old;
      }
      return { browserSlot, fingerprint, draftFingerprint };
    });
  return { handoff, select, dismiss: () => setHandoff(null) };
};

const useHhWorkplaceJob = (api, sourceSlot, fingerprint) => {
  const controller = useRef(null);
  const [snapshot, setSnapshot] = useState(null);
  const available = typeof api?.cvHhWorkplaceStart === 'function';
  useEffect(() => {
    if (!available || !sourceSlot || !fingerprint) {
      return;
    }
    const initial = { browserSlot: sourceSlot, fingerprint };
    const job = new PrivateCvJobState(api, setSnapshot, {
      initial,
      fields: Object.keys(initial),
      prefix: 'cvHhWorkplace',
      pendingKey: `meta-sovereign:hh-experience-workplace:${fingerprint}`,
      checked: (row, requestId) =>
        confirmedHhWorkplaceJob(row, requestId, initial),
      running: hhExperienceWorkplaceRunning,
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
  }, [api, available, sourceSlot, fingerprint]);
  if (!available || !fingerprint || snapshot?.fingerprint !== fingerprint) {
    return null;
  }
  return {
    ...snapshot,
    active: hhExperienceWorkplaceRunning(snapshot.row),
    start: () => controller.current?.mutate('Start'),
    decide: (decision) =>
      controller.current?.mutate('Decide', {
        fingerprint,
        browserSlot: sourceSlot,
        decision,
      }),
    stop: () => controller.current?.mutate('Stop'),
    refresh: () => controller.current?.refresh(),
    reset: () => controller.current?.newRequest(),
  };
};

export const useExperienceWorkplaceReview = ({
  api,
  browserSlot,
  run,
  preparation,
  selection,
}) => {
  const handoff = selection?.handoff;
  const sourceSlot = handoff?.browserSlot;
  const fingerprint = handoff?.fingerprint;
  const [plan, setPlan] = useState(null);
  const [failed, setFailed] = useState(null);
  const [retry, setRetry] = useState(0);
  const selectedPlan = fingerprint === plan?.fingerprint ? plan : null;
  const native = useHhWorkplaceJob(
    api,
    sourceSlot,
    selectedPlan?.status === 'reviewed' ? fingerprint : null
  );
  useEffect(() => {
    let current = true;
    setFailed(null);
    if (fingerprint) {
      void api
        .vacancyCvWorkplacePlanStored({ browserSlot: sourceSlot, fingerprint })
        .then(({ plan: confirmed }) => {
          if (
            current &&
            confirmed?.experience &&
            confirmed.fingerprint === fingerprint
          ) {
            setPlan(confirmed);
          } else if (current) {
            setFailed(fingerprint);
          }
        })
        .catch(() => {
          if (current) {
            setFailed(fingerprint);
          }
        });
    }
    return () => {
      current = false;
    };
  }, [api, sourceSlot, fingerprint, retry]);
  if (!handoff) {
    return null;
  }
  return {
    browserSlot: handoff.browserSlot,
    matchingSlot: sourceSlot === browserSlot,
    plan: selectedPlan,
    native,
    loadError: Boolean(fingerprint && failed === fingerprint),
    reload: () => setRetry((value) => value + 1),
    dismiss: selection.dismiss,
    approve: () =>
      run('cv-workplace-review', async () => {
        const answer = await api.vacancyCvWorkplaceReview({
          browserSlot: sourceSlot,
          fingerprint,
        });
        selection.select(answer.plan);
        return answer;
      }),
    prepare: () => preparation.prepareWorkplace(plan),
  };
};
