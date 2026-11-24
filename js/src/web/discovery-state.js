import { useWorkspaceJob } from './workspace-job-state.js';

export const useVacancyDiscovery = ({ api, values }) => {
  const state = useWorkspaceJob({
    api,
    slot: values.browserSlot,
    prefix: 'vacancyDiscovery',
    member: 'discovery',
  });
  return {
    ...state,
    start: (bounds) =>
      state.execute('Start', {
        ...values,
        ...bounds,
        page: 0,
        salary: values.salary === '' ? undefined : Number(values.salary),
        headless:
          values.mode === 'inherit' ? undefined : values.mode === 'headless',
        requestId: globalThis.crypto.randomUUID(),
        confirm: true,
      }),
    stop: () =>
      state.execute('Stop', {
        browserSlot: values.browserSlot,
        requestId: state.receipt?.discovery?.options.requestId,
      }),
  };
};
