import { catalogReplyKinds } from '../../js/src/automation/contextual-replies.js';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { mcpInspectionCode } from './mcp-inspection-code.mjs';
import { dictionaries } from '../../js/src/web/locales/index.js';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../js/src/web/tutorial.js';

const inspectTextReply = async (page, fixture) => {
  const exceptions = [];
  page.on('pageerror', (error) => exceptions.push(error.message));
  await page.addInitScript(
    ([key, value]) => globalThis.localStorage.setItem(key, value),
    fixture.tutorial
  );
  await page.goto(fixture.base);
  const verifyIntroductions = async (form, replies, words) => {
    if (fixture.alternatives) {
      for (const [index, address] of ['informal', 'formal'].entries()) {
        const name =
          address === 'informal' ? 'alternativeInformal' : 'alternativeFormal';
        if (
          (await form.locator(`[name="${name}"]`).inputValue()) !==
          fixture.alternatives[address].join('\n\n')
        ) {
          throw Error('Lost introduction catalog');
        }
        if (!fixture.alternatives[address].includes(replies[index])) {
          throw Error('Reply absent from introduction catalog');
        }
      }
      if (
        !(
          await form.locator('[data-acquaintance-catalog]').innerText()
        ).includes(words.catalogHint)
      ) {
        throw Error(`Untranslated introduction catalog`);
      }
    } else if (
      JSON.stringify(replies) !==
      JSON.stringify([fixture.informal, fixture.formal])
    ) {
      throw Error(`Unexpected private replies: ${replies}`);
    }
  };
  const capturePhone = async (form, action) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await (
      fixture.kind === 'engagement'
        ? page.locator('.automation-plan [data-ordered-reply]').first()
        : fixture.alternatives
          ? form.locator('[data-acquaintance-catalog]')
          : action
    ).scrollIntoViewIfNeeded();
    if (
      !(await page.evaluate(
        () => document.documentElement.scrollWidth <= globalThis.innerWidth
      ))
    ) {
      throw Error('Personal reply phone overflow');
    }
    await page.screenshot({
      path: `${fixture.root}/docs/screenshots/issue-56-vk-${fixture.kind}/mcp-phone.png`,
    });
    await page.setViewportSize({ width: 1180, height: 950 });
  };
  const result = [];
  let firstReplies;
  for (const [language, words] of Object.entries(fixture.words)) {
    await page.evaluate(
      (language) =>
        globalThis.localStorage.setItem('metaSovereignLocale', language),
      language
    );
    await page.goto(`${fixture.base}/?${fixture.kind}=${language}#/automation`);
    await page
      .locator(`[data-automation="automation:${fixture.kind}"]`)
      .click();
    const form = page.locator('.automation-editor');
    const action = form.locator('[name="actionKind"]');
    if ((await form.locator('[name="cooldownDays"]').inputValue()) !== '1') {
      throw Error('Lost daily cooldown');
    }
    if ((await action.locator('option:checked').innerText()) !== words.kind) {
      throw Error(`Untranslated ${language} action`);
    }
    if (
      (await form.locator('[name="incomingRecognizer"]').inputValue()) !==
      fixture.kind
    ) {
      throw Error('Lost personal reply recognizer');
    }
    if (language === 'en') {
      await form.locator('[name="informal"]').fill(fixture.informal);
      await form.locator('[name="formal"]').fill(fixture.formal);
      if (fixture.alternatives) {
        await form
          .locator('[name="alternativeInformal"]')
          .fill(fixture.alternatives.informal.join('\n\n'));
        await form
          .locator('[name="alternativeFormal"]')
          .fill(fixture.alternatives.formal.join('\n\n'));
      }
      const put = page.waitForResponse(
        (r) =>
          r.url().endsWith('/api/automations') && r.request().method() === 'PUT'
      );
      await form.getByRole('button', { name: words.save, exact: true }).click();
      if ((await put).status() !== 200) {
        throw Error('Personal reply save failed');
      }
      await page.reload();
      await page
        .locator(`[data-automation="automation:${fixture.kind}"]`)
        .click();
    }
    if (
      (await form.locator('[name="formal"]').inputValue()) !== fixture.formal ||
      (await form.locator('[name="informal"]').inputValue()) !==
        fixture.informal
    ) {
      throw Error('Personal reply variants changed');
    }
    const request = page.waitForResponse((r) =>
      r.url().endsWith('/api/automations/plan')
    );
    await form
      .getByRole('button', { name: words.preview, exact: true })
      .click();
    if ((await request).status() !== 200) {
      throw Error('Personal reply preview failed');
    }
    const replies = await page
      .locator('.automation-plan blockquote')
      .allTextContents();
    await verifyIntroductions(form, replies, words);
    if (fixture.kind === 'engagement') {
      const reviews = page.locator('.automation-plan [data-ordered-reply]');
      if ((await reviews.count()) !== 2) {
        throw Error('Missing ordered personal reply reviews');
      }
      for (const review of await reviews.all()) {
        if (
          (await review.locator('[data-ordered-step]').count()) !== 2 ||
          !(await review.innerText()).includes(words.orderedHint) ||
          !(
            await review.locator('[data-ordered-step="1"]').innerText()
          ).includes('59431')
        ) {
          throw Error('Missing translated sticker-first ordered review');
        }
      }
    }
    if (
      firstReplies &&
      JSON.stringify(firstReplies) !== JSON.stringify(replies)
    ) {
      throw Error('Reply choice changed on repeated review');
    }
    firstReplies = replies;
    if (language === 'en') {
      await capturePhone(form, action);
    }
    result.push({
      language,
      translated: true,
      retainedVariants: true,
      privateReplies: 2,
      stableAlternatives: Boolean(fixture.alternatives),
      ...(fixture.kind === 'engagement' ? { orderedSteps: 2 } : {}),
    });
  }
  if (exceptions.length) {
    throw Error(JSON.stringify(exceptions));
  }
  return { result, exceptions, liveProvider: false };
};

export const writeVkTextReplyInspection = (kind, base) =>
  writeFile(
    `ci-logs/vk-${kind}-mcp-code.js`,
    mcpInspectionCode(inspectTextReply, {
      kind,
      base,
      root: resolve('.'),
      informal: `Informal ${kind} <MCP> & 👋`,
      formal: `Formal ${kind} <MCP> & 👋`,
      ...(catalogReplyKinds.includes(kind)
        ? {
            alternatives: {
              informal: [
                'Informal catalog <one> & 👋',
                'Informal catalog <two> & 👋',
              ],
              formal: [
                'Formal catalog <one> & 👋',
                'Formal catalog <two> & 👋',
              ],
            },
          }
        : {}),
      tutorial: [
        TUTORIAL_STORAGE_KEY,
        JSON.stringify({ off: true, v: TUTORIAL_VERSION }),
      ],
      words: Object.fromEntries(
        ['en', 'ru', 'hi', 'zh'].map((language) => [
          language,
          {
            kind: dictionaries[language][`questions.kind.reply-${kind}`],
            save: dictionaries[language]['common.save'],
            preview: dictionaries[language]['automations.preview'],
            catalogHint: dictionaries[language]['acquaintance.catalogHint'],
            orderedHint: dictionaries[language]['engagement.hint'] ?? null,
          },
        ])
      ),
    })
  );
