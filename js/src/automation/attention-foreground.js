import { setTimeout as delay } from 'node:timers/promises';

const pages = new WeakMap();
const probes = new WeakMap();
const PROBE_MS = 750;

/** Keep the browser page in-process, outside the portable attention receipt. */
export const bindAttentionPage = (notice, page) => {
  if (notice.focusAvailable && page) {
    pages.set(notice, page);
  }
  return notice;
};

const readForeground = async (page) => {
  const session = await page.context().newCDPSession(page);
  try {
    // Chromium otherwise honors Playwright's synthetic focus override.
    await session.send('Emulation.setFocusEmulationEnabled', {
      enabled: false,
    });
    const { frameTree } = await session.send('Page.getFrameTree');
    const { executionContextId } = await session.send(
      'Page.createIsolatedWorld',
      {
        frameId: frameTree.frame.id,
        worldName: 'meta-sovereign-owner-attention',
      }
    );
    const { result } = await session.send('Runtime.evaluate', {
      contextId: executionContextId,
      expression:
        'document.visibilityState === "visible" && document.hasFocus()',
      returnByValue: true,
      timeout: PROBE_MS,
    });
    return result?.value === true;
  } finally {
    await session.detach();
  }
};

export const attentionPageForeground = async (notice) => {
  const page = pages.get(notice);
  if (!page || page.isClosed?.() || typeof page.context !== 'function') {
    return false;
  }
  let probe = probes.get(page);
  if (!probe) {
    probe = readForeground(page)
      .catch(() => false)
      .finally(() => probes.delete(page));
    probes.set(page, probe);
  }
  const timer = new AbortController();
  try {
    return await Promise.race([
      probe,
      delay(PROBE_MS, false, { signal: timer.signal }),
    ]);
  } finally {
    timer.abort();
  }
};
