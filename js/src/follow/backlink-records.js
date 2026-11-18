import { backlinkFailure, backlinkInteger } from './backlink-shape.js';

export const loadBacklinkJob = async (store, { jobId } = {}) => {
  if (
    typeof jobId !== 'string' ||
    !/^follow-backlink-job:[a-f\d-]{36}$/u.test(jobId)
  ) {
    throw backlinkFailure('bad-request');
  }
  const job = await store.get(jobId);
  if (job?.kind !== 'follow-backlink-job') {
    throw backlinkFailure('not-found');
  }
  return globalThis.structuredClone(job);
};

export const listBacklinkJobs = async (store, body = {}) => {
  const limit = backlinkInteger(body.limit, 20, 1, 100);
  const offset = backlinkInteger(body.offset, 0, 0, 1000000);
  const jobs = [];
  let total = 0;
  await store.scan(
    (link) => link.kind === 'follow-backlink-job',
    32,
    async (batch) => {
      for (const job of batch) {
        if (total >= offset && jobs.length < limit) {
          jobs.push(globalThis.structuredClone(job));
        }
        total += 1;
      }
    }
  );
  return {
    jobs,
    total,
    nextOffset: offset + jobs.length < total ? offset + jobs.length : null,
  };
};
