import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { mcpInspectionCode } from './mcp-inspection-code.mjs';
import { dictionaries } from '../../js/src/web/locales/index.js';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../js/src/web/tutorial.js';

const inspectIdentity = async (page, fixture) => {
  const exceptions = [];
  page.on('pageerror', (error) => exceptions.push(error.message));
  await page.addInitScript(
    ([key, value]) => globalThis.localStorage.setItem(key, value),
    fixture.tutorial
  );
  await page.goto(fixture.base);
  const result = [];
  for (const [language, words] of Object.entries(fixture.words)) {
    await page.evaluate(
      (language) =>
        globalThis.localStorage.setItem('metaSovereignLocale', language),
      language
    );
    await page.goto(`${fixture.base}/?identity=${language}#/automation`);
    await page.locator('[data-automation="automation:identity"]').click();
    const form = page.locator('.automation-editor');
    const action = form.locator('[name="actionKind"]');
    if ((await action.locator('option:checked').innerText()) !== words.kind) {
      throw Error(`Untranslated ${language} action`);
    }
    if (
      (await form.locator('[name="incomingRecognizer"]').inputValue()) !==
      'identity'
    ) {
      throw Error('Lost identity recognizer');
    }
    if (language === 'en') {
      await form.locator('[name="informal"]').fill(fixture.informal);
      await form.locator('[name="formal"]').fill(fixture.formal);
      const put = page.waitForResponse(
        (r) =>
          r.url().endsWith('/api/automations') && r.request().method() === 'PUT'
      );
      await form.getByRole('button', { name: words.save, exact: true }).click();
      if ((await put).status() !== 200) {
        throw Error('Identity save failed');
      }
      await page.reload();
      await page.locator('[data-automation="automation:identity"]').click();
    }
    if (
      (await form.locator('[name="formal"]').inputValue()) !== fixture.formal ||
      (await form.locator('[name="informal"]').inputValue()) !==
        fixture.informal
    ) {
      throw Error('Identity variants changed');
    }
    const request = page.waitForResponse((r) =>
      r.url().endsWith('/api/automations/plan')
    );
    await form
      .getByRole('button', { name: words.preview, exact: true })
      .click();
    if ((await request).status() !== 200) {
      throw Error('Identity preview failed');
    }
    const replies = await page
      .locator('.automation-plan blockquote')
      .allTextContents();
    if (
      JSON.stringify(replies) !==
      JSON.stringify([fixture.informal, fixture.formal])
    ) {
      throw Error(`Unexpected private replies: ${replies}`);
    }
    if (language === 'en') {
      await page.setViewportSize({ width: 390, height: 844 });
      await action.scrollIntoViewIfNeeded();
      if (
        !(await page.evaluate(
          () => document.documentElement.scrollWidth <= globalThis.innerWidth
        ))
      ) {
        throw Error('Identity phone overflow');
      }
      await page.screenshot({
        path: `${fixture.root}/docs/screenshots/issue-56-vk-identity/mcp-phone.png`,
      });
      await page.setViewportSize({ width: 1180, height: 950 });
    }
    result.push({
      language,
      translated: true,
      retainedVariants: true,
      privateReplies: 2,
    });
  }
  if (exceptions.length) {
    throw Error(JSON.stringify(exceptions));
  }
  return { result, exceptions, liveProvider: false };
};

await writeFile(
  'ci-logs/vk-identity-mcp-code.js',
  mcpInspectionCode(inspectIdentity, {
    base: process.argv[2],
    root: resolve('.'),
    informal: 'Informal identity <MCP> & 👋',
    formal: 'Formal identity <MCP> & 👋',
    tutorial: [
      TUTORIAL_STORAGE_KEY,
      JSON.stringify({ off: true, v: TUTORIAL_VERSION }),
    ],
    words: Object.fromEntries(
      ['en', 'ru', 'hi', 'zh'].map((language) => [
        language,
        {
          kind: dictionaries[language]['questions.kind.reply-identity'],
          save: dictionaries[language]['common.save'],
          preview: dictionaries[language]['automations.preview'],
        },
      ])
    ),
  })
);
