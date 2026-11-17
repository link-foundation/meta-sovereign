import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { mcpInspectionCode } from './mcp-inspection-code.mjs';
import { dictionaries } from '../../js/src/web/locales/index.js';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../js/src/web/tutorial.js';
import { apiLink, apiLinkAutomation } from './question-api-links-fixture.mjs';
import {
  emailLinkAutomation,
  emailLinkTarget,
} from './question-email-links-fixture.mjs';

import {
  vkQuestionAutomation,
  vkQuestionLink,
} from './question-vk-links-fixture.mjs';

const inspect = async (page, data) => {
  const errors = [];
  const followed = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('request', (request) => {
    if (request.url().startsWith('https://example.test/')) {
      followed.push(request.url());
    }
  });
  await page.addInitScript((entries) => {
    for (const [key, value] of entries) {
      globalThis.localStorage.setItem(key, value);
    }
  }, data.storage);
  await page.setViewportSize({ width: 1180, height: 950 });
  await page.goto(data.base);
  const results = [];
  for (const [locale, label] of Object.entries(data.labels)) {
    await page.evaluate(
      (value) => globalThis.localStorage.setItem('metaSovereignLocale', value),
      locale
    );
    await page.goto(`${data.base}/?api-link-review=${locale}#/automation`);
    await page
      .locator(`[data-automation="${data.automation}"]`)
      .first()
      .click();
    const response = page.waitForResponse((value) =>
      value.url().endsWith('/api/automations/plan')
    );
    await page
      .locator(
        'form.automation-editor .automation-actions > button[type="button"]'
      )
      .first()
      .click();
    if ((await response).status() !== 200) {
      throw new Error('Preview failed');
    }
    const evidence = page
      .locator('.automation-plan [data-answer-evidence]')
      .first();
    const links = evidence.locator('[data-question-links]');
    await links.waitFor();
    if ((await links.locator('code').textContent()) !== data.target) {
      throw new Error('Destination changed');
    }
    if ((await links.locator('small').textContent()) !== label) {
      throw new Error(`Missing ${locale} label`);
    }
    if (await links.locator('a').count()) {
      throw new Error('Destination became an active link');
    }
    if (locale === 'en') {
      await page.setViewportSize({ width: 390, height: 844 });
      await evidence.scrollIntoViewIfNeeded();
      if (
        !(await page.evaluate(
          () => document.documentElement.scrollWidth <= globalThis.innerWidth
        ))
      ) {
        throw new Error('Phone overflow');
      }
      await page.screenshot({
        path: `${data.root}/docs/screenshots/issue-56-question-${data.kind}-links/mcp-phone.png`,
      });
      await page.setViewportSize({ width: 1180, height: 950 });
    }
    results.push({ locale, literalDestination: true, translatedLabel: true });
  }
  await page.reload();
  if (await page.locator('.automation-plan').count()) {
    throw new Error('Reload replayed the preview');
  }
  if (errors.length || followed.length) {
    throw new Error(JSON.stringify({ errors, followed }));
  }
  return {
    results,
    errors,
    followed,
    reloadReplayed: false,
    liveProvider: false,
  };
};

const email = process.argv.includes('--email');
const vk = process.argv.includes('--vk');
const kind = vk ? 'vk' : email ? 'email' : 'api';
const code = mcpInspectionCode(inspect, {
  base: process.argv[2],
  root: resolve('.'),
  storage: [
    [TUTORIAL_STORAGE_KEY, JSON.stringify({ off: true, v: TUTORIAL_VERSION })],
  ],
  kind,
  automation: vk
    ? vkQuestionAutomation.id
    : email
      ? emailLinkAutomation.id
      : apiLinkAutomation.id,
  target: vk
    ? vkQuestionLink.first
    : email
      ? emailLinkTarget('mime')
      : apiLink.first,
  labels: Object.fromEntries(
    ['en', 'ru', 'hi', 'zh'].map((locale) => [
      locale,
      dictionaries[locale]['browserAnswer.links'],
    ])
  ),
});
await writeFile(`ci-logs/question-${kind}-links-mcp-code.js`, code);
