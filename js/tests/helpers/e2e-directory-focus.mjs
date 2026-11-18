import { assert } from './e2e-chat.mjs';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';

// Hold at most 32 callbacks, only for one finite keyboard assertion. Release
// in finally even when the original implementation cannot mount its target.
export const holdDirectoryFrames = async (page) => {
  await page.evaluate(() => {
    const request = globalThis.requestAnimationFrame.bind(globalThis);
    const cancel = globalThis.cancelAnimationFrame.bind(globalThis);
    const pending = new Map();
    let next = -1;
    globalThis.requestAnimationFrame = (callback) => {
      if (pending.size >= 32) {
        return request(callback);
      }
      const id = next--;
      pending.set(id, callback);
      return id;
    };
    globalThis.cancelAnimationFrame = (id) => {
      if (!pending.delete(id)) {
        cancel(id);
      }
    };
    globalThis.releaseDirectoryFrames = () => {
      globalThis.requestAnimationFrame = request;
      globalThis.cancelAnimationFrame = cancel;
      pending.forEach((callback) => request(callback));
      pending.clear();
    };
  });
};

export const verifyDirectoryHome = async (page, until) => {
  const list = page.locator('.chat-list');
  await list.locator('[data-chat="telegram:150"]').focus();
  await holdDirectoryFrames(page);
  try {
    for (const [key, chat] of [
      ['Home', '1'],
      ['End', '150'],
      ['ArrowUp', '149'],
      ['Home', '1'],
      ['ArrowDown', '2'],
      ['Home', '1'],
    ]) {
      await page.keyboard.press(key);
      await until(
        () =>
          list
            .evaluate(
              (node, id) =>
                globalThis.document.activeElement ===
                node.querySelector(`[data-chat="telegram:${id}"]`),
              chat
            )
            .catch(() => false),
        `keyboard focus reaches ${chat} before viewport frames resume (${key})`
      );
      assert(
        (await list.locator('[data-chat]').count()) < 60,
        'keyboard reveal retains bounded directory rendering'
      );
    }
    if (process.env.E2E_ARTIFACT_DIR) {
      await mkdir(process.env.E2E_ARTIFACT_DIR, { recursive: true });
      await page.screenshot({
        path: join(process.env.E2E_ARTIFACT_DIR, 'directory-focus-after.png'),
      });
    }
  } catch (error) {
    if (process.env.E2E_ARTIFACT_DIR) {
      await mkdir(process.env.E2E_ARTIFACT_DIR, { recursive: true });
      await page.screenshot({
        path: join(process.env.E2E_ARTIFACT_DIR, 'directory-held-frame.png'),
      });
    }
    throw error;
  } finally {
    await page.evaluate(() => globalThis.releaseDirectoryFrames());
  }
};
