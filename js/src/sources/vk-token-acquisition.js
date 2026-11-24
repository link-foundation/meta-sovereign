import { randomUUID } from 'node:crypto';
import { inspectVkToken } from './vk-auth.js';
import {
  capturedVkToken,
  parseVkTokenInput,
  vkTokenFailure,
} from './vk-token-input.js';
import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';

export const VK_TOKEN_SECRET_ID = 'secret:vk:user-token';
const PUBLIC_FAILURES = new Set([
  'invalid-token-input',
  'invalid-token-redirect',
  'authorization-refused',
  'authorization-navigation-refused',
  'authorization-unavailable',
  'authorization-cleanup-failed',
  'authorization-cancelled',
  'invalid-user-token',
  'token-account-mismatch',
  'token-save-failed',
]);

const identityOf = (inspection, expectedId) => {
  const id = String(inspection?.user?.id ?? '');
  if (
    !['messages', 'no-messages'].includes(inspection?.verdict) ||
    !/^[1-9][0-9]{0,15}$/.test(id)
  ) {
    throw vkTokenFailure('invalid-user-token');
  }
  if (expectedId !== undefined && id !== expectedId) {
    throw vkTokenFailure('token-account-mismatch');
  }
  return {
    id,
    name: String(inspection.user.name ?? '').slice(0, 200),
    messages: inspection.verdict === 'messages',
    offline: inspection.offline === true,
  };
};

const terminalFailure = (job, error) => ({
  state:
    job.controller.signal.aborted || error?.code === 'authorization-cancelled'
      ? 'cancelled'
      : 'failed',
  id: job.id,
  code: job.controller.signal.aborted
    ? job.expired
      ? 'authorization-expired'
      : 'authorization-cancelled'
    : PUBLIC_FAILURES.has(error?.code)
      ? error.code
      : 'authorization-failed',
});

const ownedTask = (job, receive, validate, deadlineMs, failed, finished) => {
  const timer = globalThis.setTimeout(() => {
    job.expired = true;
    job.controller.abort();
  }, deadlineMs);
  timer.unref?.();
  return Promise.resolve()
    .then(() => receive(job.controller.signal))
    .then((captured) => validate(job, captured))
    .catch((error) => failed(terminalFailure(job, error)))
    .finally(() => {
      globalThis.clearTimeout(timer);
      finished();
    });
};

/** One owned authorization at a time. Reads/restarts never launch or replay it. */
export const createVkTokenAcquisition = ({
  store,
  protectedStorage = false,
  openAuthorization,
  inspect = inspectVkToken,
  fetchImpl = globalThis.fetch,
  deadlineMs = 300000,
  now = Date.now,
} = {}) => {
  if (
    !Number.isSafeInteger(deadlineMs) ||
    deadlineMs < 1 ||
    deadlineMs > 300000
  ) {
    throw new Error('invalid VK authorization lifetime');
  }
  let closing = false;
  let active = null;
  let status = { state: 'idle', id: null };
  const read = () => ({
    ok: true,
    ...globalThis.structuredClone(status),
    capabilities: {
      authorize: typeof openAuthorization === 'function',
      protectedStorage: protectedStorage === true,
    },
  });
  const validateAndSave = async (job, captured) => {
    const { token, userId } = capturedVkToken(captured);
    const { signal } = job.controller;
    signal.throwIfAborted();
    status = { state: 'validating', id: job.id };
    const inspection = await inspect({
      token,
      signal,
      fetchImpl: (url, input) => fetchImpl(url, { ...input, signal }),
    });
    signal.throwIfAborted();
    const identity = identityOf(inspection, userId);
    identity.name = identity.name.replaceAll(token, '<redacted>');
    try {
      await saveAcknowledgedRecord(store, {
        id: VK_TOKEN_SECRET_ID,
        tokens: ['secret', 'vk', 'user-token'],
        value: token,
        accountId: identity.id,
        inspectedAt: now(),
        capabilities: {
          messages: identity.messages,
          offline: identity.offline,
        },
      });
    } catch {
      throw vkTokenFailure('token-save-failed');
    }
    // Once the store acknowledges a write, cancellation cannot claim it vanished.
    status = {
      state: 'saved',
      id: job.id,
      identity,
      code: identity.messages ? 'saved' : 'saved-no-messages',
    };
  };
  const launch = (receive, input) => {
    if (closing || active) {
      throw vkTokenFailure(
        closing ? 'authorization-closed' : 'authorization-busy'
      );
    }
    if (input?.confirm !== true) {
      throw vkTokenFailure('confirmation-required');
    }
    if (protectedStorage !== true) {
      throw vkTokenFailure('protected-storage-required');
    }
    const job = { id: randomUUID(), controller: new AbortController() };
    active = job;
    status = { state: 'waiting', id: job.id };
    job.done = ownedTask(
      job,
      receive,
      validateAndSave,
      deadlineMs,
      (value) => {
        status = value;
      },
      () => {
        active = null;
      }
    );
    return job;
  };
  return {
    read,
    start(input) {
      if (typeof openAuthorization !== 'function') {
        throw vkTokenFailure('authorization-unavailable');
      }
      launch((signal) => openAuthorization({ signal }), input);
      return read();
    },
    import(input) {
      // Parse before admitting a task; never retain a pasted URL in its receipt.
      const captured = parseVkTokenInput(input?.value);
      launch(() => captured, input);
      return read();
    },
    async cancel(input) {
      if (!active || input?.id !== active.id) {
        throw vkTokenFailure('authorization-not-current');
      }
      active.controller.abort();
      await active.done;
      return read();
    },
    async close() {
      closing = true;
      active?.controller.abort();
      await active?.done;
    },
  };
};
