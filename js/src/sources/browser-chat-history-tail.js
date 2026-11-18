/* global window, document */
import { randomUUID } from 'node:crypto';

const tails = new WeakMap();
const failure = (reason) =>
  Object.assign(
    new Error('The browser history ownership could not be verified'),
    {
      code: `browser-chat-view-${reason}`,
      scanReason: reason,
      historyReason: reason,
      fallback: false,
    }
  );
const sameIds = (left, right) =>
  left.length === right.length &&
  left.every((id, index) => id === right[index]);
const sameBindings = (left, right) =>
  left.length === right.length &&
  left.every((item, index) =>
    ['frame', 'key', 'url', 'length'].every(
      (field) => item[field] === right[index][field]
    )
  );

/** This witness only revokes reuse; it cannot authorize navigation or delivery. */
export const browserHistoryTailWitness = ({ operation, token }) => {
  const key = Symbol.for('meta-sovereign.browser-history-tail.v1');
  if (operation === 'open' && !window[key] && !document.hasFocus()) {
    const state = { token, interrupted: false };
    state.mark = (event) => {
      const inactive =
        window[Symbol.for('meta-sovereign.browser-inactive-view.v1')];
      const owned =
        event === inactive?.ownedInput ||
        (inactive?.ownedFilterControl &&
          event.type === 'input' &&
          event.target === inactive?.ownedFilterControl);
      if (!owned && (event.isTrusted || event.type === 'input')) {
        state.interrupted = true;
      }
    };
    state.focus = () => {
      if (document.hasFocus()) {
        state.interrupted = true;
      }
    };
    state.events = [
      'pointerdown',
      'keydown',
      'wheel',
      'touchstart',
      'touchmove',
      'input',
    ];
    for (const type of state.events) {
      document.addEventListener(type, state.mark, {
        capture: true,
        passive: true,
      });
    }
    window.addEventListener('focus', state.focus, true);
    document.addEventListener('visibilitychange', state.focus, true);
    window[key] = state;
  }
  const state = window[key];
  if (!state || state.token !== token) {
    return false;
  }
  if (operation === 'release') {
    for (const type of state.events) {
      document.removeEventListener(type, state.mark, true);
    }
    window.removeEventListener('focus', state.focus, true);
    document.removeEventListener('visibilitychange', state.focus, true);
    delete window[key];
  }
  return !state.interrupted && !document.hasFocus();
};

const witness = async (record, operation) => {
  const results = await Promise.allSettled(
    record.bindings.map(async ({ frame }) =>
      frame.evaluate(browserHistoryTailWitness, {
        operation,
        token: record.token,
      })
    )
  );
  const failed = results.find((result) => result.status === 'rejected');
  if (failed) {
    throw failed.reason;
  }
  return results.map((result) => result.value);
};
const forget = async (page, record) => {
  if (tails.get(page) === record) {
    tails.delete(page);
  }
  for (const event of ['framenavigated', 'framedetached', 'close']) {
    page.off(event, record.invalidate);
  }
  await witness(record, 'release').catch(() => {});
};

/** A push may truncate only the precisely witnessed automation-owned suffix. */
export const verifyBrowserHistoryTransition = (
  before,
  after,
  restoring = false
) => {
  const prefix = before.ids.slice(0, before.index + 1);
  const samePrefix = sameIds(prefix, after.ids.slice(0, prefix.length));
  if (restoring) {
    return samePrefix && after.index === before.index;
  }
  return (
    samePrefix &&
    ((after.index === before.index && sameIds(before.ids, after.ids)) ||
      (after.index === before.index + 1 &&
        after.ids.length === after.index + 1 &&
        !before.ids.includes(after.ids[after.index])))
  );
};

export const claimBrowserHistoryTail = async (page, bindings, position) => {
  const prior = tails.get(page);
  let reusable = false;
  if (prior) {
    reusable =
      sameBindings(prior.bindings, bindings) &&
      prior.position.index === position.index &&
      sameIds(prior.position.ids, position.ids) &&
      (await witness(prior, 'status').catch(() => [false])).every(Boolean);
    await forget(page, prior);
  }
  if (position.index !== position.ids.length - 1 && !reusable) {
    throw failure('history-forward');
  }
  // Chromium bounds joint history to 50 entries. Never evict an owner prefix.
  if (position.index >= 48) {
    throw failure('history-capacity');
  }
  const record = {
    token: randomUUID(),
    bindings: bindings.map((item) => ({ ...item })),
  };
  record.invalidate = () => {
    forget(page, record).catch(() => {});
  };
  try {
    if (!(await witness(record, 'open')).every(Boolean)) {
      throw failure('owner-active');
    }
  } catch (error) {
    await forget(page, record);
    throw error;
  }
  let retained = false;
  return {
    reused: reusable,
    async retain(next) {
      if (
        next.index === next.ids.length - 1 ||
        !(await witness(record, 'status')).every(Boolean) ||
        !verifyBrowserHistoryTransition(position, next, true)
      ) {
        return;
      }
      record.position = next;
      record.bindings = bindings.map((item) => ({ ...item }));
      for (const event of ['framenavigated', 'framedetached', 'close']) {
        page.on(event, record.invalidate);
      }
      tails.set(page, record);
      retained = true;
    },
    async release() {
      if (!retained) {
        await forget(page, record);
      }
    },
  };
};
