import { setTimeout as delay } from 'node:timers/promises';
import { cvPrepareFailure } from './cv-prepare-record.js';

/** Shared native keyboard insertion; every step rechecks owner fields and focus. */
export const prepareCvControlledText = async ({
  page,
  selector,
  before,
  after,
  maxLength,
  read,
  wait,
  check,
  phase,
  settleMs,
}) => {
  const editor = page.locator(selector);
  const handle = await editor.elementHandle();
  if (!handle) {
    throw cvPrepareFailure('draft');
  }
  try {
    const unchanged = async (expected, focused = false, controlled = true) => {
      const state = await read(expected, controlled);
      const same = await handle.evaluate(
        (node, { focused, selector }) =>
          node.isConnected &&
          node === globalThis.document.querySelector(selector) &&
          (!focused || node === globalThis.document.activeElement),
        { focused, selector }
      );
      check();
      if (!same || !state) {
        throw cvPrepareFailure('draft');
      }
    };
    await handle.focus();
    await delay(settleMs);
    await unchanged(before, true);
    await phase('preparing');
    await unchanged(before, true);
    await handle.press('ControlOrMeta+A', { timeout: 10000 });
    await unchanged(before, true);
    await page.keyboard.insertText(after);
    await unchanged(after, true, false);
    // A native change after bulk insertion settles HH's controlled textarea.
    // At maxlength, remove/restore one complete code point instead of overflowing.
    if (maxLength >= 0 && after.length === maxLength && after.length) {
      const last = Array.from(after).at(-1);
      await handle.evaluate(
        (node, size) =>
          node.setSelectionRange(node.value.length - size, node.value.length),
        last.length
      );
      check();
      await handle.press('Backspace', { timeout: 10000 });
      await unchanged(after.slice(0, -last.length), true, false);
      await page.keyboard.insertText(last);
    } else {
      await handle.press('Space', { timeout: 10000 });
      await unchanged(`${after} `, true, false);
      await handle.press('Backspace', { timeout: 10000 });
    }
    await wait();
    await editor.blur();
    await delay(settleMs);
    await unchanged(after);
  } finally {
    await handle.dispose();
  }
};
