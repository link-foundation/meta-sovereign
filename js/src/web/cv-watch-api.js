import {
  cvWatchOptions,
  cvWatchResult,
  cvSnapshotsResult,
} from '../jobs/cv-watch-record.js';

const checked = (value, input) => {
  if (value?.watch === null) {
    return { watch: null };
  }
  return { watch: cvWatchResult(value?.watch, input) };
};
export const createCvWatchApi = ({ get, report, local }) => ({
  vacancyCvWatch: async (input) => {
    cvWatchOptions(input);
    const value = checked(
      await report('/api/vacancies/cv-watch', input, {
        network: true,
        read: false,
      }),
      input
    );
    if (!value.watch) {
      throw new Error('jobs-cv-state');
    }
    return value;
  },
  vacancyCvWatchStop: async (input) =>
    checked(
      await report('/api/vacancies/cv-watch-stop', input, {
        network: true,
        read: false,
      }),
      input
    ),
  vacancyCvWatchStatus: async (input) => {
    const value = await get(
      `/api/vacancies/cv-watch-status?${new URLSearchParams(input)}`
    );
    if (value) {
      return checked(value, input);
    }
    const store = await local();
    const requestId =
      input.requestId ??
      (await store.get(`jobs-cv-watch-latest:${input.browserSlot}`))?.requestId;
    if (!requestId) {
      return { watch: null };
    }
    const watch = cvWatchResult(
      await store.get(`jobs-cv-watch:${requestId}`),
      input
    );
    return {
      watch: watch.active
        ? {
            ...watch,
            active: false,
            state: 'interrupted',
            code: 'jobs-cv-interrupted',
          }
        : watch,
    };
  },
  vacancyCvSnapshots: async (input) => {
    const value = await get(
      `/api/vacancies/cv-snapshots?${new URLSearchParams(input)}`
    );
    const raw = value ??
      (await (await local()).get(`jobs-cv-snapshots:${input.browserSlot}`)) ?? {
        browserSlot: input.browserSlot,
        snapshots: [],
      };
    return cvSnapshotsResult(raw, input);
  },
});
