import { randomUUID } from 'node:crypto';
import { createBacklinkProvider } from './backlink-provider.js';
import { backlinkError, backlinkFailure } from './backlink-shape.js';
import { loadBacklinkJob, listBacklinkJobs } from './backlink-records.js';
import { createBacklinkPreview } from './backlink-preview.js';
import { saveBacklink } from './backlink-journal.js';
import { createBacklinkWorker } from './backlink-worker.js';

const PREFIX = 'follow-backlink-job:';
const locks = new WeakSet();
const active = new WeakMap();
const copy = (value) => globalThis.structuredClone(value);
const wait = (ms, signal) =>
  new Promise((resolve) => {
    const done = () => {
      globalThis.clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = globalThis.setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
    if (signal?.aborted) {
      done();
    }
  });
const drain = async (pending) => {
  while (pending.size) {
    await Promise.allSettled([...pending]);
  }
};
export const createFollowBacklinks = ({
  store,
  telegramAccount,
  provider = (source) =>
    createBacklinkProvider({ store, telegramAccount }, source),
  now = Date.now,
  sleep = wait,
  trace = () => {},
}) => {
  const plans = new Map();
  const pending = new Set();
  const controls = new Map();
  const lifetime = new globalThis.AbortController();
  let stopped = false;
  const owned = (use) => {
    const task = Promise.resolve().then(() => {
      if (stopped) {
        throw backlinkFailure('stopped');
      }
      return use();
    });
    pending.add(task);
    task.then(
      () => pending.delete(task),
      () => pending.delete(task)
    );
    return task;
  };
  const launch = async (job) => {
    if (locks.has(store)) {
      throw backlinkFailure('busy');
    }
    locks.add(store);
    const control = new globalThis.AbortController();
    controls.set(job.id, control);
    active.set(store, { jobId: job.id, control });
    try {
      const adapter = await provider(job.config.source);
      if (stopped) {
        throw backlinkFailure('stopped');
      }
      job.status = 'queued';
      await saveBacklink(store, job);
      const run = createBacklinkWorker({
        store,
        adapter,
        job,
        control,
        now,
        sleep,
        trace,
      });
      const task = Promise.resolve()
        .then(run)
        .catch(async (error) => {
          job.status = 'paused';
          job.failure = backlinkError(error);
          await saveBacklink(store, job);
        })
        .finally(() => {
          pending.delete(task);
          controls.delete(job.id);
          locks.delete(store);
          active.delete(store);
        });
      pending.add(task);
      task.catch(() => trace({ event: 'follow_backlink_storage_failed' }));
      return copy(job);
    } catch (error) {
      controls.delete(job.id);
      locks.delete(store);
      active.delete(store);
      throw error;
    }
  };
  const preview = createBacklinkPreview({
    provider,
    plans,
    now,
    sleep: (ms) => sleep(ms, lifetime.signal),
    trace,
    stopped: () => stopped,
  });
  return {
    preview: (body) => owned(() => preview(body)),
    apply: (body = {}) =>
      owned(async () => {
        if (body.confirm !== true) {
          throw backlinkFailure('confirmation-required');
        }
        if (locks.has(store)) {
          throw backlinkFailure('busy');
        }
        const plan = plans.get(body.planId);
        plans.delete(body.planId);
        if (!plan || plan.expiresAt <= now()) {
          throw backlinkFailure('plan-expired');
        }
        const { planId: _planId, expiresAt: _expires, ...data } = copy(plan);
        return launch({
          ...data,
          id: `${PREFIX}${randomUUID()}`,
          kind: 'follow-backlink-job',
          status: 'queued',
          createdAt: now(),
        });
      }),
    status: (body) => owned(() => loadBacklinkJob(store, body)),
    list: (body) => owned(() => listBacklinkJobs(store, body)),
    resume: (body = {}) =>
      owned(async () => {
        if (body.confirm !== true) {
          throw backlinkFailure('confirmation-required');
        }
        const job = await loadBacklinkJob(store, body);
        if (!['paused', 'queued', 'running'].includes(job.status)) {
          throw backlinkFailure('outcome-unknown');
        }
        return launch(job);
      }),
    cancel: (body = {}) =>
      owned(async () => {
        if (body.planId !== undefined) {
          plans.delete(body.planId);
          return { ok: true };
        }
        await loadBacklinkJob(store, body);
        const current = active.get(store);
        if (current?.jobId !== body.jobId) {
          return { ok: false, code: 'not-running' };
        }
        current.control.abort();
        return { ok: true };
      }),
    async idle() {
      await drain(pending);
    },
    async stop() {
      stopped = true;
      lifetime.abort();
      plans.clear();
      for (const control of controls.values()) {
        control.abort();
      }
      await drain(pending);
    },
  };
};
