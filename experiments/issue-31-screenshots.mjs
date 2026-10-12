// Issue #31 / PR #34: regenerate the case-study screenshots from the
// seeded demo server, so every picture in the PR can be reproduced.
//
//   node experiments/automations-spa-server.mjs 4799 &
//   node experiments/issue-31-screenshots.mjs [url] [outDir] [names,comma]
/* global localStorage */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:4799/';
const outDir = process.argv[3] ?? 'docs/case-studies/issue-31/screenshots';
const only = process.argv[4]?.split(',');

const DESKTOP = { width: 1280, height: 800 };
const TABLET = { width: 820, height: 1000 };
const PHONE = { width: 390, height: 844 };

const open = async (
  browser,
  { viewport, theme = 'light', skin = 't3', locale = 'en' }
) => {
  const context = await browser.newContext({
    viewport,
    colorScheme: theme,
    deviceScaleFactor: viewport.width < 500 ? 2 : 1,
  });
  await context.addInitScript(
    ([mode, s, l]) => {
      localStorage.setItem('metaSovereignTheme', mode);
      localStorage.setItem('metaSovereignSkin', s);
      localStorage.setItem('metaSovereignLocale', l);
      localStorage.setItem(
        'metaSovereignTutorial',
        JSON.stringify({ off: true, completed: true, at: 0 })
      );
    },
    [theme, skin, locale]
  );
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  return { context, page };
};

const go = async (page, view) => {
  const nav = page.locator(`[data-view="${view}"].nav-item`).first();
  if (!(await nav.isVisible())) {
    await page.click('[data-action="nav-more"]');
  }
  await nav.click();
  await page.waitForTimeout(300);
};

const openChat = async (page, name) => {
  await page.locator('.chat-item', { hasText: name }).first().click();
  await page.waitForTimeout(300);
};

// Issue 31's automation, tested on Аня's chat, leaves an informal draft.
const draftForAnya = async (page) => {
  await openChat(page, 'Аня');
  await page.click('[data-action="chat-automations"]');
  await page.locator('[data-action="chat-automation-test"]').first().click();
  await page.waitForSelector('.draft-card');
  await page.waitForTimeout(300);
};

const SHOTS = {};
for (const skin of ['t3', 'telegram', 'whatsapp', 'signal']) {
  for (const theme of ['light', 'dark']) {
    SHOTS[`chat-skin-${skin}-${theme}`] = {
      setup: { viewport: DESKTOP, theme, skin },
      run: draftForAnya,
    };
  }
}
Object.assign(SHOTS, {
  'chat-automation-menu': {
    setup: { viewport: DESKTOP },
    run: async (page) => {
      await openChat(page, 'Аня');
      await page.click('[data-action="chat-automations"]');
    },
  },
  'chat-reply-suggestions': {
    setup: { viewport: DESKTOP },
    run: (page) => openChat(page, '2004'),
  },
  'chat-word-suggestions': {
    setup: { viewport: DESKTOP },
    run: async (page) => {
      await openChat(page, '2003');
      await page.locator('.chat-composer textarea').fill('Отлично, ');
      await page.waitForTimeout(500);
    },
  },
  'automations-editor-preview': {
    setup: { viewport: { width: 1280, height: 1100 } },
    run: async (page) => {
      await go(page, 'automation');
      await page.locator('.automation-list button').first().click();
      await page.waitForTimeout(300);
      await page
        .locator('.automation-actions button', { hasText: 'Preview' })
        .click();
      await page.waitForTimeout(800);
    },
    fullPage: true,
  },
  'settings-appearance': {
    setup: { viewport: DESKTOP },
    run: (page) => go(page, 'settings'),
  },
  'phone-chat-list': {
    setup: { viewport: PHONE },
    run: () => {},
  },
  'phone-chat-draft': {
    setup: { viewport: PHONE },
    run: draftForAnya,
  },
  'phone-more-sheet': {
    setup: { viewport: PHONE },
    run: (page) => page.click('[data-action="nav-more"]'),
  },
  'phone-contacts': {
    setup: { viewport: PHONE },
    run: (page) => go(page, 'contacts'),
  },
  'phone-automation-ru': {
    setup: { viewport: PHONE, locale: 'ru', theme: 'dark' },
    run: (page) => go(page, 'automation'),
  },
  'tablet-chat-rail-ru': {
    setup: { viewport: TABLET, locale: 'ru' },
    run: (page) => openChat(page, 'Аня'),
  },
});

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
for (const [name, shot] of Object.entries(SHOTS)) {
  if (only && !only.includes(name)) {
    continue;
  }
  const { context, page } = await open(browser, shot.setup);
  await shot.run(page);
  await page.screenshot({
    path: path.join(outDir, `${name}.png`),
    fullPage: Boolean(shot.fullPage),
  });
  await context.close();
  console.log(name);
}
await browser.close();
