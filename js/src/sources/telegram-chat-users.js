// One bounded scan/contact run per connected account, shared by CLI/API/UI.
import { connect, runIn } from './telegram-stickers.js';
import { exportTarget, resolveExportTarget } from './telegram-export-target.js';
import {
  createUserCollection,
  scanOptions,
} from './telegram-chat-users-shape.js';
import { scanChatUsers } from './telegram-chat-users-scan.js';
import { addChatContacts } from './telegram-chat-users-contacts.js';
import {
  createUsersRuntime,
  usersJob,
  usersJobSnapshot,
  usersErrorCode,
  scanCoverage,
} from './telegram-chat-users-runtime.js';
import { createUsersPlans } from './telegram-chat-users-plans.js';

const BAD = { ok: false, code: 'bad-request' };
const listPage = (values, offset, limit) => {
  const page = [];
  let index = 0;
  for (const value of values) {
    if (index++ >= offset) {
      page.push(globalThis.structuredClone(value));
    }
    if (page.length >= limit) {
      break;
    }
  }
  return page;
};
const usersStatus =
  (env, runtime) =>
  async (body = {}) => {
    const offset = body.offset ?? 0;
    const limit = body.limit ?? 100;
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 500
    ) {
      return BAD;
    }
    const { job, collection } = runtime.state;
    if (!job) {
      return {
        ok: true,
        job: null,
        users: [],
        results: [],
        offset,
        more: false,
      };
    }
    if (job.kind === 'scan') {
      const users = listPage(collection.users.values(), offset, limit);
      return {
        ok: true,
        job: usersJobSnapshot(job),
        users,
        results: [],
        offset,
        more: offset + users.length < collection.users.size,
      };
    }
    const all = await env.store.query(
      (link) => link.kind === 'telegram-contact-result' && link.jobId === job.id
    );
    return {
      ok: true,
      job: usersJobSnapshot(job),
      users: [],
      results: all.slice(offset, offset + limit),
      offset,
      more: offset + limit < all.length,
    };
  };
const scanStart =
  (env, userClient, runtime, plans, now) =>
  async (body = {}) => {
    const chat = exportTarget(body.chat);
    const options = scanOptions(body);
    if (!chat || !options) {
      return BAD;
    }
    if (runtime.busy()) {
      return { ok: false, code: 'busy' };
    }
    runtime.state.starting = true;
    try {
      const c = await connect(env, userClient);
      if (!c) {
        return { ok: false, supported: false, code: 'user-account-required' };
      }
      const resolved = await runIn(env, `chat-users:resolve:${chat}`, () =>
        resolveExportTarget(c.client, { chat })
      );
      runtime.state.collection = createUserCollection();
      plans.clear();
      runtime.state.job = usersJob(now, 'scan', resolved.chat, options, {
        users: 0,
        unresolvedMentions: 0,
        coverage: scanCoverage(options),
      });
      await runtime.publish();
      runtime.run(c, scanChatUsers);
      return { ok: true, job: usersJobSnapshot(runtime.state.job) };
    } catch (error) {
      if (runtime.state.job?.state === 'running') {
        runtime.state.job.state = 'failed';
        runtime.state.job.code = usersErrorCode(error);
      }
      return { ok: false, code: usersErrorCode(error) };
    } finally {
      runtime.state.starting = false;
    }
  };
const contactsApply =
  (env, userClient, runtime, plans, now) =>
  async (body = {}) => {
    if (body.confirm !== true || typeof body.planId !== 'string') {
      return BAD;
    }
    if (runtime.busy()) {
      return { ok: false, code: 'busy' };
    }
    const plan = plans.consume(body.planId);
    if (!plan) {
      return { ok: false, code: 'preview-expired' };
    }
    runtime.state.starting = true;
    try {
      const c = await connect(env, userClient);
      if (!c) {
        return { ok: false, code: 'user-account-required' };
      }
      runtime.state.job = usersJob(now, 'contacts', plan.chat, plan.options, {
        planId: plan.id,
        processed: 0,
        total: plan.users.length,
        coverage: {},
      });
      await runtime.publish();
      runtime.run(c, addChatContacts, { plan });
      return { ok: true, job: usersJobSnapshot(runtime.state.job) };
    } catch (error) {
      if (runtime.state.job?.state === 'running') {
        runtime.state.job.state = 'failed';
        runtime.state.job.code = usersErrorCode(error);
      }
      return { ok: false, code: usersErrorCode(error) };
    } finally {
      runtime.state.starting = false;
    }
  };
export const createChatUsers = (
  env,
  { userClient },
  { now = () => Date.now() } = {}
) => {
  const runtime = createUsersRuntime(env, now);
  const plans = createUsersPlans(runtime, now);
  return {
    chatUsersStart: scanStart(env, userClient, runtime, plans, now),
    chatUsersCancel: runtime.cancel,
    chatUsersContactsPreview: plans.preview,
    chatUsersContactsApply: contactsApply(env, userClient, runtime, plans, now),
    chatUsersStatus: usersStatus(env, runtime),
  };
};
