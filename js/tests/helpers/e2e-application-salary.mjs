import assert from 'node:assert/strict';
import { applicationNativeFixture } from '../../../experiments/issue-56/application-native-fixture.mjs';
import { configureApplicationAnswerContext } from '../../../experiments/issue-56/application-answer-context-ui.mjs';
import { applicationPanelBrowser } from './application-panel-browser.mjs';
import {
  nativeApplicationReviewRequest,
  nativeApplicationForm,
  nativeApplicationFormUrl,
} from './application-native-request.mjs';
import { applicationSalary } from '../../../experiments/issue-56/application-salary-fixture.mjs';
import { seedApplicationAnswerContext } from '../../../experiments/issue-56/application-answer-context-fixture.mjs';

export const verifyApplicationSalary = async (browser) => {
  const fixture = await applicationNativeFixture(browser, {
    salary: 'до 200000 ₽',
  });
  const controls = applicationPanelBrowser(fixture);
  try {
    await seedApplicationAnswerContext(fixture.store);
    await controls.select();
    await configureApplicationAnswerContext(controls.panel);
    await controls.action('start').click();
    await controls.panel
      .locator('[data-application-salary="exclude"]')
      .waitFor();
    await controls.confirm();
    assert(await controls.action('enter').isDisabled());
    assert(await controls.action('form').isDisabled());
    assert(await controls.action('submit').isDisabled());
    const directory = process.env.SALARY_APPLICATION_SCREENSHOTS;
    if (directory) {
      await controls.panel.locator('h3').scrollIntoViewIfNeeded();
      await fixture.page.screenshot({
        path: `${directory}/issue-56-application-salary-after.png`,
      });
    }
    await controls.locales('[data-application-salary="exclude"]');
    await controls.phone();
    if (directory) {
      await controls.panel.screenshot({
        path: `${directory}/issue-56-application-salary-phone.png`,
      });
    }
    await controls.close(
      browser
        .contexts()
        .flatMap((context) => context.pages())
        .find((page) => page.url() === 'https://hh.ru/vacancy/123')
    );
    assert(fixture.records.every((row) => !row.clicks));
  } finally {
    await fixture.close();
  }
  const direct = await applicationNativeFixture(browser, {
    salary: 'до 200000 ₽',
    ownerAnswers: {
      experience: 'Actual owner experience',
      letter: 'Actual owner letter',
    },
  });
  try {
    const receipt = await nativeApplicationReviewRequest(direct, 'open', null, {
      salary: applicationSalary,
      formUrl: nativeApplicationFormUrl,
    });
    assert.equal(receipt.salaryAdmission.action, 'exclude');
    assert.equal(receipt.restoration.state, 'restored');
    const owned = nativeApplicationForm(browser);
    assert.equal(
      await owned.locator('#experience').inputValue(),
      'Actual owner experience'
    );
    assert.equal(
      await owned
        .locator('[data-qa="vacancy-response-form-letter-input"]')
        .inputValue(),
      'Actual owner letter'
    );
    assert.equal(await owned.evaluate(() => globalThis.applicationAttempts), 0);
    assert.equal(receipt.draft.fields.length, 2);
    const qa = await direct.store.get(
      'secret:jobs-application-answers:jobs:123'
    );
    assert.equal(qa.draftId, receipt.draft.id);
    if (process.env.SALARY_APPLICATION_SCREENSHOTS) {
      await owned.screenshot({
        path: `${process.env.SALARY_APPLICATION_SCREENSHOTS}/issue-56-application-salary-draft.png`,
      });
    }
    await nativeApplicationReviewRequest(direct, 'close', receipt);
    assert(owned.isClosed());
    assert(direct.records.every((row) => row.closed));
    assert.equal(
      direct.records.reduce((count, row) => count + (row.clicks ?? 0), 0),
      1,
      'only disclose the saved letter field'
    );
    assert.deepEqual(direct.errors, []);
    return {
      blockedEntry: true,
      directFormRecovered: true,
      ownerFields: 2,
      locales: 4,
      phoneOverflow: false,
      sends: 0,
      ownedResourcesClosed: true,
      liveProvider: false,
    };
  } finally {
    await direct.close();
  }
};
