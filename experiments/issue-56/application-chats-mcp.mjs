/* global localStorage, innerWidth */
import { resolve } from 'node:path';
import { mcpInspectionCode } from './mcp-inspection-code.mjs';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../js/src/web/tutorial.js';

const inspect = async (page, config) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const check = (condition, message) => {
    if (!condition) {
      throw new Error(message);
    }
  };
  const stats = async () => (await page.request.get(config.control)).json();
  await page.setViewportSize({ width: 1180, height: 950 });
  await page.goto(config.base);
  await page.evaluate(({ key, version }) => {
    localStorage.setItem(key, JSON.stringify({ off: true, v: version }));
    localStorage.setItem('metaSovereignLocale', 'en');
  }, config);
  await page.goto(`${config.base}/#/cv`);
  const panel = page.locator('[data-application-panel]');
  const vacancies = page.locator('[data-vacancies]');
  await vacancies.locator('[data-vacancy-field="query"]').fill('Python');
  await vacancies.locator('[data-vacancy-action="search"]').click();
  await vacancies.locator('[data-vacancy-action="collect"]').first().click();
  await panel.locator('[data-application-missing]').waitFor();
  await panel
    .locator('[data-application-option="autoSelectResumeLanguage"]')
    .uncheck();
  const batch = panel.locator('[data-application-batch]');
  const field = (name) =>
    batch.locator(`[data-application-batch-field="${name}"]`);
  const button = (name) =>
    batch.locator(`[data-application-batch-action="${name}"]`);
  check(
    !(await field('processChats').isChecked()),
    'Chat child must default off'
  );
  await field('processChats').check();
  check(
    (await field('chatsIntervalMinutes').inputValue()) === '120',
    '120 minute default'
  );
  check(
    !(await batch.locator('[data-model-draft-opt-in]').isChecked()),
    'Model must default off'
  );
  await panel.locator('[data-application-option="pacing"]').check();
  await panel.locator('[data-application-pacing-interval]').fill('2');
  await field('urls').fill(
    'https://hh.ru/vacancy/123\nhttps://hh.ru/vacancy/456'
  );
  await field('durationMs').fill('300');
  await field('confirmBatch').check();
  await button('start').click();
  await batch
    .locator('[data-application-chats-held]')
    .waitFor({ timeout: 60000 });
  await button('follow').click();
  await panel
    .locator('[data-application-continuation="send"]')
    .waitFor({ timeout: 60000 });
  const initial = await stats();
  check(
    initial.child.pid > 0 && initial.child.held.chat === '8',
    'Actual held chat child'
  );
  check(
    initial.chat.draft === 'At 9 a.m.' &&
      initial.chat.sends === 0 &&
      initial.chat.unreadNext === (config.rejections ? 0 : 1),
    'Held unsent draft and expected unread state'
  );
  if (config.rejections) {
    check(
      initial.rejections.visits.join(',') === '9,8' &&
        initial.rejections.ownerDraft.includes('Owner unfinished line 7'),
      'Native rejection priority and owner draft preservation'
    );
  }
  const sessionReused = initial.logs.some(
    ({ event }) => event === 'application-chats-session-reused'
  );
  if (config.session) {
    check(sessionReused, 'HeadHunter chat list confirmed the reused session');
    check(
      (await batch.innerText()).includes(
        'reuse your active HeadHunter application sign-in'
      ),
      'Application custom session reuse is explained before choosing an account'
    );
  }
  if (!config.rejections) {
    await page.screenshot({
      path: `${config.screenshots}/mcp-application-chats.png`,
      fullPage: true,
    });
  }
  const locales = [];
  for (const locale of config.rejections ? ['en'] : ['ru', 'hi', 'zh', 'en']) {
    await page.evaluate(
      (value) => localStorage.setItem('metaSovereignLocale', value),
      locale
    );
    await page.reload();
    await batch.locator('[data-application-chats-held]').waitFor();
    check(
      !/application\.chats\./u.test(await batch.innerText()),
      `${locale} translation`
    );
    check(
      (await field('processChats').isChecked()) &&
        (await field('processChats').isDisabled()),
      `${locale} frozen saved intent`
    );
    locales.push(locale);
  }
  await page.setViewportSize({ width: 390, height: 950 });
  await batch.locator('[data-application-chats-held]').scrollIntoViewIfNeeded();
  check(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    ),
    'Phone layout'
  );
  await page.screenshot({
    path: `${config.screenshots}/mcp-application-chats-phone.png`,
    fullPage: false,
  });
  await button('stop').click();
  await batch
    .locator('[data-application-chats-phase="stopped"]')
    .waitFor({ timeout: 60000 });
  const stopped = await stats();
  check(
    !stopped.child.active && stopped.chat.sends === 0,
    'Stop drains without sending chat text'
  );
  check(!errors.length, errors.join(', '));
  return {
    cases: 1,
    locales,
    errors,
    initial,
    stopped,
    sessionReused,
    liveProvider: false,
  };
};

/** Browser-only inspection; native fixtures run in a separate owned process. */
export const applicationChatsMcpCode = (metadata) =>
  mcpInspectionCode(inspect, {
    ...metadata,
    key: TUTORIAL_STORAGE_KEY,
    version: TUTORIAL_VERSION,
    screenshots: resolve(
      metadata.rejections
        ? 'docs/screenshots/issue-56-application-chat-rejections'
        : metadata.session
          ? 'docs/screenshots/issue-56-application-chat-session'
          : 'docs/screenshots/issue-56-application-chats'
    ),
  });
