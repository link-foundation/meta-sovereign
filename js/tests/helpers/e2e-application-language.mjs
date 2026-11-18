import assert from 'node:assert/strict';
import { applicationResumeNativeFixture } from '../../../experiments/issue-56/application-resume-native-fixture.mjs';
import { standardLetters } from '../../../experiments/issue-56/application-language-fixture.mjs';
import { applicationPanelBrowser } from './application-panel-browser.mjs';
import { nativeApplicationForm } from './application-native-request.mjs';

const counters = (page) =>
  page.evaluate(() => ({
    entries: globalThis.applicationEntries,
    sends: globalThis.applicationAttempts,
    choices: globalThis.resumeChoices,
  }));
const changeQuestion = (page, label) =>
  page.locator('#experience').evaluate((node, text) => {
    node.parentElement.firstChild.textContent = text;
  }, label);

export const verifyNativeApplicationLanguage = async (
  browser,
  { screenshots, before = false } = {}
) => {
  const fixture = await applicationResumeNativeFixture(browser, {
    language: true,
  });
  const controls = applicationPanelBrowser(fixture);
  const { panel, action } = controls;
  const shot = controls.screenshot(screenshots, 'application-language');
  try {
    await controls.select();
    if (before) {
      await shot('before');
    }
    assert.equal(
      await panel
        .locator('[data-application-option="autoSelectResumeLanguage"]')
        .count(),
      1,
      'Default application language control is missing.'
    );
    // Shared legacy scenarios opt out; this scenario explicitly tests the new default.
    await panel
      .locator('[data-application-option="autoSelectResumeLanguage"]')
      .check();
    await panel.locator('[data-application-option="standardLetters"]').check();
    for (const language of ['en', 'ru']) {
      await panel
        .locator(`[data-application-standard-letter="${language}"]`)
        .fill(standardLetters[language]);
    }
    await panel.locator('[data-application-option="supervised"]').check();
    await action('start').click();
    await panel.locator('[data-application-state="ready"]').waitFor();
    await controls.confirmed('enter');
    await panel
      .locator('[data-application-resume-preference="automatic"]')
      .waitFor();
    const owned = nativeApplicationForm(browser);
    assert(owned, 'Policy did not open the full native form.');
    assert.deepEqual(await counters(owned), {
      entries: 0,
      sends: 0,
      choices: 1,
    });
    await owned
      .locator('#experience')
      .fill('Owner answer retained through language correction.');
    await controls.confirmed('read');
    await controls.confirmed('letter');
    const nativeLetter = owned.locator(
      '[data-qa="vacancy-response-form-letter-input"]'
    );
    assert.equal(await nativeLetter.inputValue(), standardLetters.ru);
    await changeQuestion(owned, 'What compensation do you expect in USD?');
    await controls.confirmed('read');
    await controls.confirmed('letter');
    assert.equal(await nativeLetter.inputValue(), standardLetters.en);
    assert.equal(
      await owned.locator('#experience').inputValue(),
      'Owner answer retained through language correction.'
    );
    await nativeLetter.fill('Owner edited letter retained.');
    await changeQuestion(owned, 'Расскажите о вашем последнем опыте работы');
    await controls.confirmed('read');
    await controls.confirmed('letter');
    await panel
      .locator('[data-application-letter-state="owner-conflict"]')
      .waitFor();
    assert.equal(
      await nativeLetter.inputValue(),
      'Owner edited letter retained.'
    );
    await shot('after');
    const result = await counters(owned);
    assert.deepEqual(result, { entries: 0, sends: 0, choices: 3 });
    await verifyLanguageRecovery(controls, owned);
    await controls.phone();
    await shot('phone');
    await controls.close(owned);
    return {
      ...result,
      standardCorrection: true,
      ownerEditsPreserved: true,
      locales: 4,
      errors: fixture.errors,
    };
  } finally {
    await fixture.close();
  }
};

const verifyLanguageRecovery = async (controls, owned) => {
  await controls.locales(
    '[data-application-language-policy="automatic"]',
    async () => {
      assert.equal(await controls.action('submit').isDisabled(), true);
      assert.deepEqual(await counters(owned), {
        entries: 0,
        sends: 0,
        choices: 3,
      });
    }
  );
};
