/* global innerWidth, localStorage */
import { resolve } from 'node:path';
import { mcpInspectionCode } from './mcp-inspection-code.mjs';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../js/src/web/tutorial.js';

const inspect = async (page, config) => {
  const check = (condition, message) => {
    if (!condition) {
      throw new Error(message);
    }
  };
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(config.base);
  await page.evaluate(({ key, version }) => {
    localStorage.setItem(key, JSON.stringify({ off: true, v: version }));
    localStorage.setItem('metaSovereignLocale', 'en');
  }, config);
  await page.goto(`${config.base}/#/cv`);
  const panel = page.locator('[data-application-panel]');
  const batch = panel.locator('[data-application-batch]');
  const field = (name) =>
    batch.locator(`[data-application-batch-field="${name}"]`);
  const button = (name) =>
    batch.locator(`[data-application-batch-action="${name}"]`);
  const phase = (name) =>
    batch.locator(`[data-application-batch-phase="${name}"]`);
  const loadStats = async () => (await page.request.get(config.control)).json();
  await panel
    .locator('[data-application-option="autoSelectResumeLanguage"]')
    .uncheck();
  await field('urls').fill('https://hh.ru/vacancy/123');
  await field('maxApplications').fill('1');
  await field('processChats').check();
  await field('chatWatchWaiting').check();
  check(
    (await field('chatsIntervalMinutes').inputValue()) === '1',
    'Watch interval'
  );
  await field('confirmBatch').check();
  await button('start').click();
  await button('follow').click();
  await panel.locator('[data-application-continuation="send"]').waitFor();
  await panel.locator('[data-application-option="confirm"]').check();
  await panel.locator('[data-application-action="confirm-step"]').click();
  await phase('chat-review').waitFor();
  const initial = await loadStats();
  check(
    initial.applications === 1 && initial.refreshes === 1,
    'Confirmed delivery wakes one scan'
  );
  check(
    initial.child.skip.chat === '8' && initial.child.pid > 0,
    'Exact held child'
  );
  const locales = [];
  const skip = batch.locator('[data-application-chats-skip]');
  for (const locale of ['hi', 'ru', 'zh', 'en']) {
    await page.evaluate(
      (value) => localStorage.setItem('metaSovereignLocale', value),
      locale
    );
    await page.reload();
    await skip.waitFor();
    check(
      !(await phase('chat-review').innerText()).includes('application.'),
      `${locale} translation`
    );
    locales.push({ locale, skip: await skip.innerText() });
  }
  check(
    new Set(locales.map((row) => row.skip)).size === 4,
    'Translated Skip labels'
  );
  await page.setViewportSize({ width: 390, height: 850 });
  await skip.scrollIntoViewIfNeeded();
  check(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    ),
    'Phone layout'
  );
  await page.screenshot({ path: config.screenshot });
  await skip.click();
  await batch.locator('[data-application-chats-skipped]').waitFor();
  await phase('completed').waitFor();
  await batch.locator('[data-application-chats-phase="stopped"]').waitFor();
  const stopped = await loadStats();
  check(
    stopped.lastSkip.chat === '8' &&
      stopped.browserClosed === 1 &&
      !stopped.child.active,
    'Skip and drain'
  );
  check(errors.length === 0, errors.join(', '));
  return { initial, stopped, locales, errors };
};

export const applicationChatWaitingMcpCode = (metadata) =>
  mcpInspectionCode(inspect, {
    ...metadata,
    key: TUTORIAL_STORAGE_KEY,
    version: TUTORIAL_VERSION,
    screenshot: resolve(
      'docs/screenshots/issue-56-application-chat-waiting/mcp-phone.png'
    ),
  });
