import { useEffect, useState } from 'react';

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

export const useExperienceWorkplaceReview = ({
  api,
  browserSlot,
  run,
  preparation,
  selection,
}) => {
  const handoff = selection?.handoff;
  const fingerprint =
    handoff?.browserSlot === browserSlot ? handoff.fingerprint : null;
  const [plan, setPlan] = useState(null);
  const [failed, setFailed] = useState(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true;
    setFailed(null);
    if (fingerprint) {
      void api
        .vacancyCvWorkplacePlanStored({ browserSlot, fingerprint })
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
  }, [api, browserSlot, fingerprint, retry]);
  if (!handoff) {
    return null;
  }
  return {
    browserSlot: handoff.browserSlot,
    matchingSlot: Boolean(fingerprint),
    plan: fingerprint === plan?.fingerprint ? plan : null,
    loadError: Boolean(fingerprint && failed === fingerprint),
    reload: () => setRetry((value) => value + 1),
    dismiss: selection.dismiss,
    approve: () =>
      run('cv-workplace-review', async () => {
        const answer = await api.vacancyCvWorkplaceReview({
          browserSlot,
          fingerprint,
        });
        selection.select(answer.plan);
        return answer;
      }),
    prepare: () => preparation.prepareWorkplace(plan),
  };
};
