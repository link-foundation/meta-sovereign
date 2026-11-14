import { previewAutoFollow } from './auto-preview.js';
import { randomUUID } from 'node:crypto';
import { backlinkConfig, backlinkFailure } from './backlink-shape.js';
const copy = (value) => globalThis.structuredClone(value);
const checkCapabilities = (target, config) => {
  if (target.canWrite !== true) {
    throw backlinkFailure('not-writable');
  }
  if (config.deleteIncoming && target.canCleanup === false) {
    throw backlinkFailure('cleanup-unavailable');
  }
};
export const createBacklinkPreview = ({ provider, joining, plans, now }) => {
  const preview = async (body, { read, cancelled }) => {
    const config = backlinkConfig(body);
    const adapter = await provider(config.source);
    const rows = [];
    let owner;
    for (const chat of config.chats) {
      const target = await read(() => adapter.describe(chat));
      if (
        target?.chat !== chat ||
        typeof target.owner !== 'string' ||
        !/^[1-9]\d{0,18}$/.test(target.owner)
      ) {
        throw backlinkFailure('provider-response');
      }
      owner ??= target.owner;
      if (target.owner !== owner) {
        throw backlinkFailure('account-changed');
      }
      checkCapabilities(target, config);
      rows.push({
        chat,
        title: String(target.title ?? '').slice(0, 256),
        status: 'ready',
      });
    }
    if (cancelled()) {
      throw backlinkFailure('cancelled');
    }
    for (const [id, old] of plans) {
      if (old.expiresAt <= now()) {
        plans.delete(id);
      }
    }
    if (plans.size >= 5) {
      plans.delete(plans.keys().next().value);
    }
    const plan = {
      planId: randomUUID(),
      config,
      owner,
      rows,
      expiresAt: now() + 300000,
    };
    await previewAutoFollow({
      joining,
      adapter,
      plan,
      read,
    });
    if (cancelled()) {
      throw backlinkFailure('cancelled');
    }
    plans.set(plan.planId, plan);
    return { ok: true, ...copy(plan) };
  };
  return preview;
};
