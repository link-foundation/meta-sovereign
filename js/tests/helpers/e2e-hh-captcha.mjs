import assert from 'node:assert/strict';
import { applicationLimitBrowser } from './application-limit-browser.mjs';
import { nativeApplicationForm } from './application-native-request.mjs';
import { readFormDocument } from '../../src/forms/read-document.js';
import {
  changeHhCaptchaFixture,
  hhCaptchaCounters,
} from '../../../experiments/issue-56/hh-captcha-dom.mjs';
import { changeApplicationHoldFixture } from '../../../experiments/issue-56/application-hold-dom.mjs';

export const verifyNativeHhCaptcha = async (
  browser,
  { screenshots, before = false } = {}
) => {
  const { fixture, controls, panel, action, shot } =
    await applicationLimitBrowser(browser, screenshots, 'hh-captcha');
  try {
    await controls.select();
    await panel.locator('[data-application-option="supervised"]').check();
    await action('start').click();
    await panel.locator('[data-application-state="ready"]').waitFor();
    await controls.confirmed('enter');
    const owned = nativeApplicationForm(browser);
    await owned
      .locator('#experience')
      .fill('Owner answer preserved through verification.');
    await owned.evaluate(changeHhCaptchaFixture, { hidden: true });
    await controls.confirmed('read');
    assert.equal(
      await panel.locator('[data-application-state="review"]').count(),
      1
    );
    assert.equal((await owned.evaluate(readFormDocument)).challenge, undefined);
    for (const marker of ['qa', 'name']) {
      await owned.evaluate(changeHhCaptchaFixture, { marker });
      await controls.confirmed('read');
      if (before) {
        await shot('before');
      }
      assert.equal(
        await panel.locator('[data-application-state="verification"]').count(),
        1,
        'HH text CAPTCHA boundary is missing.'
      );
      const report = await owned.evaluate(readFormDocument);
      assert.equal(report.challenge?.active, true);
      assert.equal(report.fields.length, 0);
      assert.equal(
        (await panel.innerText()).includes(
          'Owner-only synthetic verification answer'
        ),
        false
      );
      await controls.confirm();
      for (const name of ['answers', 'letter', 'submit', 'restore']) {
        assert(await action(name).isDisabled(), name);
      }
      assert.deepEqual(await owned.evaluate(hhCaptchaCounters), {
        answerReads: 0,
        htmlReads: 0,
        closes: 0,
        renews: 0,
        submits: 0,
        entries: 1,
        sends: 0,
      });
    }
    await shot('after');
    await controls.locales('[data-application-state="verification"]');
    await controls.phone();
    await shot('phone');
    await owned.evaluate(changeApplicationHoldFixture, 'daily-limit');
    await controls.confirmed('read');
    assert.equal(
      await panel.locator('[data-application-state="daily-limit"]').count(),
      1
    );
    assert.equal(
      await panel.locator('[data-application-limit="waiting"]').count(),
      1
    );
    await shot('daily-limit');
    assert.equal((await owned.evaluate(hhCaptchaCounters)).answerReads, 0);
    // Only the synthetic owner removes the gate. Product code has no solver.
    await owned.evaluate(changeHhCaptchaFixture, { clear: true });
    await owned.evaluate(changeApplicationHoldFixture, 'clear');
    await controls.confirmed('read');
    assert.equal(
      await panel.locator('[data-application-state="review"]').count(),
      1
    );
    assert.equal(
      await owned.locator('#experience').inputValue(),
      'Owner answer preserved through verification.'
    );
    await controls.close(owned);
    return {
      markers: 2,
      hiddenIgnored: true,
      completedTokenDoesNotWaiveHh: true,
      challengeReads: 0,
      challengeActions: 0,
      dailyLimitPriority: true,
      ownerValuesPreserved: true,
      locales: 4,
      entries: 1,
      sends: 0,
      errors: fixture.errors,
    };
  } finally {
    await fixture.close();
  }
};
