import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { applicationNativeFixture } from '../../../experiments/issue-56/application-native-fixture.mjs';
import { storedDeferredQuestions } from '../../src/jobs/deferred-questions.js';
import {
  openNativeAnsweredApplication,
  nativeApplicationQueue,
} from './application-native-request.mjs';

/** Actual native form, revisioned web mutation, private backup and reload. */
export const verifyDeferredQuestions = async (
  browser,
  { screenshots } = {}
) => {
  const effects = [];
  const fixture = await applicationNativeFixture(browser, {
    questionLabel: 'Relevant projects without a saved answer',
    onApplicationClose: (effect) => effects.push(effect),
  });
  const { page } = fixture;
  const policy = page.locator('[data-deferred-questions]');
  const shot = async (name) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await page.screenshot({ path: join(screenshots, `${name}.png`) });
    }
  };
  try {
    const { page: owned } = await openNativeAnsweredApplication(
      fixture,
      browser,
      { experience: '', letter: 'Actual private owner letter.' }
    );
    await page.goto(`${fixture.base}/#/cv`);
    try {
      await policy.waitFor({ timeout: 10000 });
    } catch (error) {
      await page
        .locator('[data-vacancy-skips]')
        .evaluate((element) => element.scrollIntoView({ block: 'start' }));
      await shot('before');
      throw error;
    }
    await policy
      .locator('[data-deferred-question-input]')
      .fill('Relevant projects');
    const closed = owned.waitForEvent('close');
    await policy.locator('[data-deferred-question-save]').click();
    await closed;
    await policy.locator('[data-deferred-question]').waitFor();
    const saved = await storedDeferredQuestions(fixture.store);
    assert.deepEqual(
      saved.entries.map((row) => row.vacancies),
      [['https://hh.ru/vacancy/123']]
    );
    assert.equal((await nativeApplicationQueue(fixture)).entries.length, 0);
    const recovery = (await fixture.store.query()).find((row) =>
      row.id.startsWith('secret:jobs-application-answers:')
    );
    assert.equal(recovery.fields[1].value, 'Actual private owner letter.');
    await page.reload();
    await policy.locator('[data-deferred-question]').waitFor();
    for (const [name, width] of [
      ['after', 1180],
      ['phone', 390],
    ]) {
      await page.setViewportSize({ width, height: 950 });
      await policy.scrollIntoViewIfNeeded();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= globalThis.innerWidth
        ),
        true
      );
      await shot(name);
    }
    assert.deepEqual(
      effects.map(({ attempts }) => attempts),
      [0]
    );
    assert(fixture.records.every((row) => row.closed));
    assert.deepEqual(fixture.errors, []);
    return {
      durableQuestions: 1,
      associatedVacancies: 1,
      actualLetterPreserved: true,
      queueEntries: 0,
      submissions: 0,
      widths: [1180, 390],
      browserOpens: 1,
      ownedBrowsersClosed: true,
      pageErrors: [],
      liveProvider: false,
    };
  } finally {
    await fixture.close();
  }
};
