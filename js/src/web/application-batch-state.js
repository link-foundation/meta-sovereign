import { useWorkspaceJob } from './workspace-job-state.js';

/** Status polling observes the owned run; mounting never starts or resumes one. */
export const useApplicationBatch = ({ api, values, options, session }) => {
  const slot = values.browserSlot;
  const state = useWorkspaceJob({
    api,
    slot,
    prefix: 'vacancyApplicationBatch',
    member: 'batch',
    fallback: 'jobs-application-batch-recovery',
  });
  const batch = state.receipt?.batch;
  const identity = { browserSlot: slot, requestId: batch?.requestId };
  return {
    ...state,
    start: (draft) =>
      state.execute('Start', {
        ...options,
        ...draft,
        urls: draft.urls.split(/\s+/u).filter(Boolean),
        browserSlot: slot,
        requestId: globalThis.crypto.randomUUID(),
        confirm: true,
        headless:
          values.mode === 'inherit' ? undefined : values.mode === 'headless',
      }),
    stop: () => state.execute('Stop', identity),
    mode: (change) =>
      state.execute('Mode', {
        ...identity,
        ...change,
        revision: batch?.revision,
      }),
    follow: () => session.followBatch(state.receipt.application),
  };
};
