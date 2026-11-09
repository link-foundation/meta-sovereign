// A collapsed card must remeasure on commit even if the browser delays RO.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createMemoryStore } from '../src/storage/universal.js';
import { openChatApp, assert } from './helpers/e2e-chat.mjs';

const { page, base, until, finish } = await openChatApp(
  'tutorial-card-resize',
  {
    store: createMemoryStore(),
  }
);
await page.unroute('**/api/telegram/status');
await page.setViewportSize({ width: 1280, height: 560 });
await page.addInitScript(() => {
  globalThis.localStorage.setItem('metaSovereignLocale', 'en');
  globalThis.localStorage.setItem(
    'metaSovereignTutorial',
    JSON.stringify({ v: 5, stepId: 'setup' })
  );
  globalThis.localStorage.setItem('metaSovereignTutorialProvider', 'email');
  const Observer = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class extends Observer {
    constructor(callback) {
      super((entries, observer) => {
        // Other layout observers behave normally; only the tutorial card's
        // notification is withheld, as it can be during WebKit layout.
        const ready = entries.filter(
          (entry) => !entry.target.matches('.tutorial-step')
        );
        if (ready.length) {
          callback(ready, observer);
        }
      });
    }
  };
});

await finish(async () => {
  await page.goto(`${base}/#conn-email/manual`);
  const card = page.locator('[data-tutorial-step="setup"]');
  await card.waitFor();
  await page.waitForFunction(() => {
    const node = document.querySelector('.tutorial-step');
    return node && globalThis.getComputedStyle(node).visibility !== 'hidden';
  });
  await page.locator('[data-action="connection-mode-import"]').click();
  await until(
    async () => (await card.getAttribute('data-compact')) === 'true',
    'import setup collapses card'
  );
  // Wait for the finite scroll/clear pass rather than racing first layout.
  await page.waitForTimeout(1000);
  const geometry = await page.evaluate(() => {
    const cardNode = document.querySelector('.tutorial-step');
    const targetNode = document.querySelector(
      '[data-tutorial-id="connections:detail"]'
    );
    const box = (node) => {
      const { top, left, width, height, bottom, right } =
        node.getBoundingClientRect();
      return { top, left, width, height, bottom, right };
    };
    return {
      card: box(cardNode),
      target: box(targetNode),
      style: cardNode.getAttribute('style'),
    };
  });
  const dir = process.env.E2E_ARTIFACT_DIR || '/tmp';
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, 'tutorial-card-resize.png') });
  console.log('[tutorial-card-resize]', JSON.stringify(geometry));
  const { card: c, target: t } = geometry;
  assert(c.bottom <= 560 && c.top >= 0, 'card stays inside short viewport');
  assert(
    c.bottom <= t.top ||
      c.top >= t.bottom ||
      c.right <= t.left ||
      c.left >= t.right,
    'collapsed card clears the smaller import panel'
  );
});
