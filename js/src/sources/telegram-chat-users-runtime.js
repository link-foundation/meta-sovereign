import { randomUUID } from 'node:crypto';
import { createUsersStartup } from './telegram-chat-users-startup.js';

export const activeUsersJob = (job) =>
  ['running', 'cancelling'].includes(job?.state);
export const usersJobSnapshot = (job) =>
  job ? globalThis.structuredClone(job) : null;
export const usersErrorCode = (error) =>
  error.code ?? error.errorMessage?.match(/^[A-Z_0-9]{1,80}$/)?.[0] ?? 'failed';
const waitFor = (signal, ms) =>
  new Promise((resolve) => {
    if (signal.aborted || !ms) {
      resolve();
      return;
    }
    const done = () => {
      globalThis.clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = globalThis.setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
  });
const coverage = (limit, disabled = false) => ({
  read: 0,
  limit,
  limited: false,
  complete: false,
  disabled,
  error: null,
});
export const usersJob = (now, kind, chat, options, extra = {}) => ({
  id: randomUUID(),
  kind,
  chat,
  options,
  state: 'running',
  counts: {},
  phase: kind === 'scan' ? 'participants' : 'adding',
  startedAt: new Date(now()).toISOString(),
  ...extra,
});
export const scanCoverage = (options) => ({
  participants: coverage(options.participantsLimit),
  messages: coverage(options.messagesLimit, options.messagesLimit === 0),
});
const saveUsers = async (env, job, collection) => {
  for (const user of collection.users.values()) {
    await env.store.put({
      ...user,
      id: `telegram-chat-user:${job.id}:${user.id}`,
      user: user.id,
      kind: 'telegram-chat-user',
      source: 'telegram',
      jobId: job.id,
      chat: job.chat,
    });
  }
};

export const createUsersRuntime = (env, now) => {
  const state = { job: null, collection: null, starting: false };
  let controller = null;
  let running = null;
  const cancelled = () => controller?.signal.aborted === true;
  const publish = async () => {
    const { job, collection } = state;
    if (job.kind === 'scan') {
      job.users = collection.users.size;
    }
    await env.store.put({
      ...usersJobSnapshot(job),
      id: `telegram-chat-users-job:${job.id}`,
      jobId: job.id,
      source: 'telegram',
    });
    if (job.options.debug) {
      env.log?.({
        level: 'debug',
        event: 'telegram_chat_users_progress',
        phase: job.phase,
        state: job.state,
        users: job.users,
        processed: job.processed,
      });
    }
  };
  const startup = createUsersStartup(state, publish, usersErrorCode);
  const run = (c, use, extra = {}) => {
    controller = new AbortController();
    const { job, collection } = state;
    const r = {
      env,
      c,
      job,
      collection,
      cancelled,
      publish,
      wait: (ms) =>
        env.sleep ? env.sleep(ms) : waitFor(controller.signal, ms),
      ...extra,
    };
    running = (async () => {
      try {
        await use(r);
        if (job.kind === 'scan') {
          await saveUsers(env, job, collection);
        }
        job.state = cancelled()
          ? 'cancelled'
          : job.stopped
            ? 'partial'
            : 'done';
      } catch (error) {
        job.state = cancelled() ? 'cancelled' : 'failed';
        job.code = usersErrorCode(error);
        if (job.kind === 'scan') {
          await saveUsers(env, job, collection).catch(() => {});
        }
      } finally {
        job.finishedAt = new Date(now()).toISOString();
        await publish();
      }
    })().catch(() => {
      job.state = 'failed';
      job.code = 'store-unavailable';
    });
  };
  const cancel = async () => {
    startup.invalidate();
    if (activeUsersJob(state.job)) {
      state.job.state = 'cancelling';
      controller?.abort();
      await publish();
    }
    return { ok: true, job: usersJobSnapshot(state.job) };
  };
  env.chatUsersStop = async () => {
    const closing = startup.close();
    await cancel().catch(() => {});
    await closing;
    await running;
  };
  return {
    state,
    publish,
    run,
    cancel,
    start: startup.start,
    busy: () => state.starting || activeUsersJob(state.job),
  };
};
