import {
  batchStopReason,
  guardedSend,
  isAmbiguous,
} from '../automation/outbox.js';
import { codedError } from '../sources/http.js';
import { safeMessage } from '../server/redact.js';
import { broadcastOutcome } from './outcomes.js';
import {
  listTargets,
  normalizeStoredTarget,
  normalizeTarget,
  selectTargets,
} from './targets.js';
import {
  resolvePublicationProvider,
  publicProviderState,
  requireWritable,
} from './providers.js';

export const RUN_PREFIX = 'broadcast-run:';
const problem = (message, code = 'bad-publication') => {
  throw codedError(message, code);
};
const requestId = (id = globalThis.crypto.randomUUID()) => {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(id)) {
    problem(
      'A publication request ID needs 1–80 letters, digits, dashes or underscores'
    );
  }
  return id;
};
const runId = (id) =>
  `${RUN_PREFIX}${requestId(String(id).replace(/^broadcast-run:/, ''))}`;
const textOf = (text) => {
  if (typeof text !== 'string' || !text.trim() || text.length > 100_000) {
    problem('Publication text needs 1–100,000 characters');
  }
  return text;
};
const unchangedTarget = async (store, target) => {
  const current = await store.get(target.id);
  if (
    !current?.enabled ||
    current.version !== target.version ||
    JSON.stringify(normalizeStoredTarget(current)) !==
      JSON.stringify(normalizeTarget(target))
  ) {
    problem(
      'A destination changed after preview; review a fresh preview',
      'stale-preview'
    );
  }
};
const sameProvider = (provider, binding) => {
  if (provider.binding !== binding) {
    problem(
      'Publication credentials changed after preview; review a fresh preview',
      'stale-preview'
    );
  }
};
const failed = (target, error) => ({
  targetId: target.id,
  label: target.label,
  network: target.network,
  ok: false,
  status: isAmbiguous(error) ? 'unknown' : 'failed',
  error: safeMessage(error),
  code: error?.code ?? 'provider-failed',
});
const summarized = (record) => {
  const pending = record.results.filter((entry) =>
    ['pending', 'sending'].includes(entry.status)
  ).length;
  const outcome = broadcastOutcome(
    record.results.filter(
      (entry) => !['pending', 'sending'].includes(entry.status)
    )
  );
  return {
    ...record,
    ...outcome,
    ...(pending ? { status: 'sending' } : {}),
    counts: { ...outcome.counts, pending },
  };
};
const publicPlan = ({ bindings: _bindings, ...plan }) => plan;
const requireDeletionReceipt = (raw) => {
  if (raw?.deleted !== true && raw?.data?.deleted !== true) {
    problem('Provider returned no deletion acknowledgement', 'send-unknown');
  }
};
const stopPending = (record, stopped) => ({
  ...record,
  stopped,
  results: record.results.map((entry) =>
    entry.status === 'pending'
      ? {
          ...entry,
          status: 'failed',
          code: 'batch-stopped',
          error: `Publication stopped before this destination was sent: ${stopped}`,
        }
      : entry
  ),
});

/** All callers share exact target snapshots, checked receipts and durable intent. */
const createContext = ({
  store,
  clock = () => new Date(),
  log = () => {},
  ...dependencies
}) => {
  const running = new Set();
  const providerOf = (target) =>
    resolvePublicationProvider(store, target, dependencies);
  const persist = async (record, event) => {
    const next = summarized({ ...record, updatedAt: clock().toISOString() });
    if (next.debug && event) {
      const trace = { at: next.updatedAt, ...event };
      next.events = [...(next.events ?? []), trace].slice(-200);
      try {
        log({ event: 'publication', requestId: next.requestId, ...trace });
      } catch {
        // Diagnostic sinks cannot alter a provider acknowledgement.
      }
    }
    // Some store implementations retain nested values. A later in-memory
    // update must never appear durable before its own successful put.
    await store.put(globalThis.structuredClone(next));
    return next;
  };
  return { store, clock, log, running, providerOf, persist };
};

const recoverRecord = (running, record, force = false) => {
  if (!force && running.has(record.id)) {
    return record;
  }
  return summarized({
    ...record,
    results: record.results.map((entry) => {
      if (entry.status === 'pending') {
        return {
          ...entry,
          ok: false,
          status: 'failed',
          code: 'interrupted-before-send',
          error: 'Publication stopped before this destination was sent',
        };
      }
      if (entry.status === 'sending') {
        return {
          ...entry,
          ok: false,
          status: 'unknown',
          code: 'interrupted-publication',
          error:
            'Publication was interrupted; check the destination before sending again',
        };
      }
      if (entry.deletion?.status === 'deleting') {
        return {
          ...entry,
          deletion: {
            status: 'unknown',
            code: 'interrupted-deletion',
            error: 'Deletion was interrupted; check the destination',
          },
        };
      }
      return entry;
    }),
  });
};

const createReadOperations = ({ store, providerOf, recover }) => {
  const history = async (limit = 50) => {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      problem('History limit must be 1–100');
    }
    return (await store.query((link) => link?.id?.startsWith(RUN_PREFIX)))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, limit)
      .map((record) => recover(record));
  };
  const get = async (id) => {
    const record = globalThis.structuredClone(await store.get(runId(id)));
    if (!record) {
      problem('Publication history entry not found', 'not-found');
    }
    return recover(record);
  };
  const test = async (id) => {
    const [target] = await selectTargets(store, { targetIds: [id] });
    const provider = await providerOf(target);
    try {
      requireWritable(provider);
      return {
        targetId: target.id,
        ...publicProviderState(provider),
        ...(await provider.test()),
      };
    } catch (error) {
      return {
        ...publicProviderState(provider),
        ...failed(target, error),
        verified: false,
      };
    }
  };
  return { history, get, test, targets: () => listTargets(store) };
};

const createPublishOperations = ({
  store,
  clock,
  log,
  running,
  providerOf,
  persist,
  recover,
}) => {
  const prepare = async (body) => {
    const targets = await selectTargets(store, body);
    if (body.debug !== undefined && typeof body.debug !== 'boolean') {
      problem('debug must be boolean');
    }
    const providers = await Promise.all(targets.map(providerOf));
    const plan = {
      requestId: requestId(body.requestId),
      text: textOf(body.text),
      debug: body.debug ?? false,
      targets,
      capabilities: providers.map((p, i) => ({
        targetId: targets[i].id,
        ...publicProviderState(p),
      })),
      bindings: providers.map((p) => p.binding),
    };
    return { preview: publicPlan(plan), data: plan };
  };
  const checkedProviders = async (plan) => {
    const providers = [];
    for (const [index, target] of plan.targets.entries()) {
      await unchangedTarget(store, target);
      const provider = await providerOf(target);
      sameProvider(provider, plan.bindings[index]);
      providers.push(provider);
    }
    return providers;
  };
  const publishOne = async (plan, target, provider) => {
    const outcome = await guardedSend({
      store,
      kind: 'broadcast',
      owner: `publication:${target.id}`,
      clock,
      key: `publication:${plan.requestId}:${target.id}`,
      draft: {
        source: target.network,
        chat: target.destination || null,
        text: plan.text,
      },
      userConfirmed: true,
      log,
      send: async ({ clientId }) => {
        await unchangedTarget(store, target);
        const current = await providerOf(target);
        sameProvider(current, provider.binding);
        requireWritable(current);
        return current.post(plan.text, clientId);
      },
    });
    return {
      targetId: target.id,
      label: target.label,
      network: target.network,
      mode: provider.mode,
      ok: outcome.status === 'sent',
      status: outcome.status,
      ...(outcome.status === 'sent'
        ? { receipt: outcome.result }
        : { code: outcome.code, error: outcome.error }),
    };
  };
  const publish = async (plan) => {
    const id = runId(plan.requestId);
    if (running.has(id)) {
      problem('This publication is already running', 'publication-running');
    }
    running.add(id);
    try {
      const before = await store.get(id);
      if (before) {
        if (
          before.body !== plan.text ||
          JSON.stringify(before.targets) !== JSON.stringify(plan.targets)
        ) {
          problem(
            'Request ID already belongs to another publication',
            'request-conflict'
          );
        }
        return recover(before, true);
      }
      // Validate every snapshot before the first provider write.
      const providers = await checkedProviders(plan);
      let record = {
        id,
        tokens: ['broadcast-run'],
        requestId: plan.requestId,
        body: plan.text,
        debug: plan.debug,
        targets: plan.targets,
        createdAt: clock().toISOString(),
        results: plan.targets.map((target) => ({
          targetId: target.id,
          label: target.label,
          network: target.network,
          status: 'pending',
          ok: false,
        })),
      };
      record = await persist(record, {
        operation: 'publication',
        status: 'prepared',
      });
      let failures = 0;
      for (const [index, target] of plan.targets.entries()) {
        record.results[index] = { ...record.results[index], status: 'sending' };
        const event = {
          operation: 'publish',
          targetId: target.id,
          network: target.network,
        };
        record = await persist(record, { ...event, status: 'sending' });
        record.results[index] = await publishOne(
          plan,
          target,
          providers[index]
        );
        const result = record.results[index];
        failures = result.status === 'sent' ? 0 : failures + 1;
        const stopped = batchStopReason(result, failures);
        if (stopped) {
          record = stopPending(record, stopped);
        }
        record = await persist(record, { ...event, status: result.status });
        if (stopped) {
          break;
        }
      }
      return record;
    } finally {
      running.delete(id);
    }
  };
  return { prepare, publish };
};

const createDeleteOperations = ({
  clock,
  running,
  providerOf,
  persist,
  get,
}) => {
  const prepareDelete = async ({ id, targetIds }) => {
    const record = await get(id);
    const selected =
      targetIds === undefined
        ? record.results
            .filter((entry) => entry.receipt && !entry.deletion)
            .map((entry) => entry.targetId)
        : targetIds;
    if (
      !Array.isArray(selected) ||
      !selected.length ||
      selected.length > 100 ||
      new Set(selected).size !== selected.length
    ) {
      problem('Choose 1–100 published destinations to delete');
    }
    const entries = selected.map((targetId) => {
      const entry = record.results.find(
        (result) => result.targetId === targetId
      );
      if (
        !entry?.receipt ||
        entry.status !== 'sent' ||
        (entry.deletion && entry.deletion.status !== 'failed')
      ) {
        problem(
          'Only a known publication with no pending or uncertain deletion can be deleted'
        );
      }
      const target = {
        ...record.targets.find((t) => t.id === targetId),
        authMode: entry.mode,
      };
      return { target, receipt: entry.receipt };
    });
    const providers = await Promise.all(
      entries.map(({ target }) => providerOf(target))
    );
    return {
      preview: {
        id: record.id,
        posts: entries.map(({ target, receipt }) => ({
          targetId: target.id,
          label: target.label,
          network: target.network,
          receipt,
        })),
      },
      data: {
        id: record.id,
        entries,
        bindings: providers.map((p) => p.binding),
      },
    };
  };
  const deletePublished = async (plan) => {
    const id = runId(plan.id);
    if (running.has(id)) {
      problem('This publication is already changing', 'publication-running');
    }
    running.add(id);
    try {
      let record = await get(id);
      // All receipts and credential identities must still match the preview.
      const providers = [];
      for (const [index, { target, receipt }] of plan.entries.entries()) {
        const entry = record.results.find((r) => r.targetId === target.id);
        if (
          JSON.stringify(entry?.receipt) !== JSON.stringify(receipt) ||
          (entry.deletion && entry.deletion.status !== 'failed')
        ) {
          problem('Publication changed after preview', 'stale-preview');
        }
        const provider = await providerOf(target);
        sameProvider(provider, plan.bindings[index]);
        requireWritable(provider);
        providers.push(provider);
      }
      for (const [index, { target, receipt }] of plan.entries.entries()) {
        const entry = record.results.find((r) => r.targetId === target.id);
        entry.deletion = { status: 'deleting', at: clock().toISOString() };
        const event = {
          operation: 'delete',
          targetId: target.id,
          network: target.network,
        };
        record = await persist(record, { ...event, status: 'deleting' });
        let deletion;
        try {
          const provider = await providerOf(target);
          sameProvider(provider, providers[index].binding);
          const raw = await provider.remove(receipt);
          requireDeletionReceipt(raw);
          deletion = { status: 'deleted', at: clock().toISOString() };
        } catch (error) {
          deletion = {
            status: isAmbiguous(error) ? 'unknown' : 'failed',
            code: error?.code ?? 'provider-failed',
            error: safeMessage(error),
            at: clock().toISOString(),
          };
        }
        record.results.find((r) => r.targetId === target.id).deletion =
          deletion;
        record = await persist(record, { ...event, status: deletion.status });
        if (batchStopReason(deletion, 0)) {
          break;
        }
      }
      return record;
    } finally {
      running.delete(id);
    }
  };
  return { prepareDelete, deletePublished };
};

export const createPublicationService = (options) => {
  const context = createContext(options);
  context.recover = (record, force) =>
    recoverRecord(context.running, record, force);
  const reads = createReadOperations(context);
  const writes = {
    ...createPublishOperations(context),
    ...createDeleteOperations({ ...context, get: reads.get }),
  };
  const active = new Set();
  let closing = false;
  const tracked = (run) => async (plan) => {
    if (closing) {
      problem('Publication service is closing', 'publication-closed');
    }
    const job = run(plan);
    active.add(job);
    try {
      return await job;
    } finally {
      active.delete(job);
    }
  };
  return {
    ...reads,
    ...writes,
    publish: tracked(writes.publish),
    deletePublished: tracked(writes.deletePublished),
    close: () => {
      closing = true;
      return Promise.allSettled([...active]);
    },
  };
};
