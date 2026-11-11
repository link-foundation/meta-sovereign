import { verifyFormCaptchaUi } from './helpers/e2e-form-captcha.mjs';
import { verifyAssignmentPublicationUi } from './helpers/e2e-assignment-publication.mjs';
import { verifyAssignmentSourceDocument } from './helpers/e2e-assignment-source-document.mjs';
import { assignmentPublisherFixture } from '../../experiments/issue-56/assignment-publisher-fixture.mjs';
import {
  assignmentSourceBrowserFixture,
  withAssignmentSourceModel,
} from '../../experiments/issue-56/assignment-source-fixture.mjs';
import { verifyFormAssignmentUi } from './helpers/e2e-form-assignment.mjs';
import { verifyAssignmentFixture } from '../../experiments/issue-56/forms-assignment-fixture.mjs';
import { seedFormPay } from '../../experiments/issue-56/forms-pay-fixture.mjs';
import { verifyFormMatchingUi } from './helpers/e2e-form-matching.mjs';
import { verifyFormAutomaticUi } from './helpers/e2e-form-automatic.mjs';
import { verifyFormPayUi } from './helpers/e2e-form-pay.mjs';
import { modelRunnerFixture } from '../../experiments/issue-56/forms-model-fixture.mjs';
import { verifyFormModelUi } from './helpers/e2e-form-model.mjs';
import { verifyFormLinksUi } from './helpers/e2e-form-links.mjs';
import { seedLinkAnswers } from '../../experiments/issue-56/forms-links-fixture.mjs';
import { seedFormPlace } from '../../experiments/issue-56/forms-timezone-fixture.mjs';
import { verifyFormTimezoneUi } from './helpers/e2e-form-timezone.mjs';
import { seedSubjectAnswers } from '../../experiments/issue-56/forms-subject-fixture.mjs';
import { verifyFormSubjectsUi } from './helpers/e2e-form-subjects.mjs';
import { seedFormAnswers } from '../../experiments/issue-56/forms-plan-fixture.mjs';
import { verifyFormPlanUi } from './helpers/e2e-form-plans.mjs';
import { verifyFormReviewUi } from './helpers/e2e-form-reviews.mjs';
import { verifyFormPrefillUi } from './helpers/e2e-form-prefill.mjs';
import { verifyFormRadioUi } from './helpers/e2e-form-radio.mjs';
import { verifyFormCustomUi } from './helpers/e2e-form-custom.mjs';
import { verifyFormConfiguredResumeUi } from './helpers/e2e-form-configured-resume.mjs';
import { verifyFormUploadUi } from './helpers/e2e-form-upload.mjs';
import { verifyFormChoicesUi } from './helpers/e2e-form-choices.mjs';
import { verifyFormJournalUi } from './helpers/e2e-form-journal.mjs';
import { verifyFormMonitorUi } from './helpers/e2e-form-monitor.mjs';
import { verifyFormLearningUi } from './helpers/e2e-form-learning.mjs';
import { verifyFormCapacityUi } from './helpers/e2e-form-capacity.mjs';
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, openChatApp, fulfil } from './helpers/e2e-chat.mjs';
import { makeBrowserCommander } from 'browser-commander';
import {
  startFormsFixture,
  driftFormDocumentClock,
} from '../../experiments/issue-56/forms-reader-fixture.mjs';
import { readFormDocument } from '../src/forms/read-document.js';
import { readFile } from 'node:fs/promises';
import { TUTORIAL_STORAGE_KEY, TUTORIAL_VERSION } from '../src/web/tutorial.js';
import { traceBrowserInputs } from './helpers/e2e-input-trace.mjs';

const fixture = await startFormsFixture();
const store = createMemoryStore();
await seedFormAnswers(store);
await seedLinkAnswers(store);
await seedFormPlace(store);
await seedSubjectAnswers(store);
await seedFormPay(store);
const owned = [];
const sourceReads = [];
const modelCalls = [];
const publication = await assignmentPublisherFixture();
publication.modelRunner = withAssignmentSourceModel(publication.modelRunner);
const formModel = modelRunnerFixture(modelCalls);
const writeAssignmentIssue = publication.github.writeIssue;
let loseAssignmentIssueResponse = true;
publication.github.writeIssue = async (...args) => {
  const issue = await writeAssignmentIssue(...args);
  if (loseAssignmentIssueResponse) {
    loseAssignmentIssueResponse = false;
    throw new Error('Synthetic lost issue response');
  }
  return issue;
};
let app;
try {
  app = await openChatApp('forms-reader', {
    store,
    serverOptions: {
      answerModel: {
        draft: (input) =>
          input.schema.properties.deliverable
            ? publication.modelRunner(input)
            : formModel(input),
        stop: async () => {},
      },
      forms: {
        readAssignmentSource: assignmentSourceBrowserFixture({
          store,
          browser: () => app.page.context().browser(),
          records: sourceReads,
        }),
        assignmentGithub: publication.github,
        verifyAssignmentRepository: verifyAssignmentFixture,
        review: {
          learn: process.env.FORMS_LEARNING_BEFORE !== '1',
          learning: { stableMs: 800 },
        },
        availability: async () => ({
          available: true,
          missing: [],
          reason: null,
        }),
        openSession: async (options) => {
          assert(
            options.useCase === 'forms' &&
              ['application-2', 'application-3'].includes(options.slot),
            'shared Forms slot/policy'
          );
          const context = await app.page.context().browser().newContext();
          const page = await context.newPage();
          if (process.env.FORMS_DOCUMENT_CLOCK_DRIFT === '1') {
            await page.addInitScript(driftFormDocumentClock);
          }
          const commander = makeBrowserCommander({
            page,
            enableNetworkTracking: false,
            enableNavigationManager: false,
            enableDialogManager: false,
          });
          const record = {
            options,
            page,
            navigation: [],
            closed: false,
            events: [],
          };
          const goto = commander.goto.bind(commander);
          commander.goto = (input) => {
            record.navigation.push(input.url);
            return goto(input);
          };
          owned.push(record);
          return {
            page,
            commander,
            trace:
              process.env.CI || process.env.CI_BROWSER_DEBUG === '1'
                ? (event) =>
                    console.log('[forms-inspection]', JSON.stringify(event))
                : undefined,
            policy: { headless: true },
            async close() {
              for (const frame of page.frames()) {
                record.events.push(
                  ...(await frame.evaluate(() => globalThis.events ?? []))
                );
              }
              const experience = page.locator('[name="experience"]');
              record.values = (await experience.count())
                ? await experience.inputValue()
                : null;
              await commander.destroy();
              await context.close();
              record.closed = true;
            },
          };
        },
      },
    },
  });
} catch (error) {
  await fixture.close();
  throw error;
}

await traceBrowserInputs(
  app.page,
  '[data-answer-model-settings] input, [data-answer-model-settings] button'
);
await app.page.addInitScript(
  ({ key, value }) => globalThis.localStorage.setItem(key, value),
  {
    key: TUTORIAL_STORAGE_KEY,
    value: JSON.stringify({ off: true, v: TUTORIAL_VERSION }),
  }
);
const verifyReport = (report) => {
  if (!report.ok) {
    console.error('[forms-fixture-report]', JSON.stringify(report));
  }
  assert(
    report.ok && report.fields.length === 15 && report.frames.length === 2,
    'native, ARIA and cross-origin fields share one report'
  );
  const byName = (name) => report.fields.find((field) => field.name === name);
  assert(
    byName('salary').label === 'Salary expectations per month' &&
      byName('salary').labelSource === 'aria-labelledby',
    'referenced labels take precedence'
  );
  assert(
    byName('salary').description === 'In local currency, after tax.',
    'description evidence'
  );
  assert(
    byName('start').label === 'Availability' &&
      byName('start').labelSource === 'legend',
    'fieldset fallback'
  );
  assert(
    byName('experience').label === 'Recent experience' &&
      byName('experience').labelSource === 'heading',
    'preceding heading'
  );
  assert(
    byName('portfolio').labelSource === 'placeholder' &&
      byName('language').labelSource === 'title',
    'weaker label provenance'
  );
  assert(
    byName('location').label === 'Location' &&
      byName('location').options[0].selected &&
      byName('location').options[1].disabled,
    'choice state'
  );
  assert(
    byName('password').value === null && byName('resume').value === null,
    'sensitive getters never invoked'
  );
  assert(
    report.fields.some(
      (field) =>
        field.group?.label === 'Work arrangement' &&
        field.label === 'Remote' &&
        field.checked
    ),
    'ARIA radio group'
  );
  assert(
    report.fields.some((field) => field.disabled && field.checked),
    'inherited disabled choice'
  );
  assert(
    report.coverage === 'partial' &&
      report.omissions.some((item) => item.reason === 'hidden-frame'),
    'hidden frames not claimed read'
  );
  assert(
    report.frames.some((frame) => frame.reasons.includes('unexpanded-options')),
    'unopened controls explicit'
  );
};

const verifyReadOnly = (report) => {
  const byName = (name) => report.fields.find((field) => field.name === name);
  assert(
    owned.length === 1 && owned[0].closed && owned[0].events.length === 0,
    'no input, click, change, submit or orphaned browser'
  );
  assert(
    owned[0].values === 'First line\n  Second line' &&
      byName('experience').value === owned[0].values,
    'current whitespace preserved'
  );
  assert(
    fixture.submits === 0 &&
      fixture.requests.every((request) => request.method === 'GET'),
    'fixture received no submission'
  );
};

const verifyLimits = async (page) => {
  // Exercise strict extraction caps with finite controls, on a separate page.
  const probe = await page.context().newPage();
  try {
    await probe.setContent(
      `<form>${Array.from({ length: 202 }, (_, i) => `<label>Question ${i}<input value="${i}"></label>`).join('')}</form>`
    );
    const limited = await probe.evaluate(readFormDocument, {});
    assert(
      limited.fields.length === 200 && limited.reasons.includes('field-limit'),
      'finite field cap'
    );
    await probe.setContent(
      `<label>Options<select>${Array.from({ length: 102 }, (_, i) => `<option>${i}</option>`).join('')}</select></label><label>Long<textarea>${'a'.repeat(10001)}</textarea></label><x-question></x-question>`
    );
    const options = await probe.evaluate(readFormDocument, {});
    assert(
      options.fields[0].options.length === 100 &&
        options.fields[1].label === 'Long' &&
        options.reasons.includes('option-limit') &&
        options.reasons.includes('value-limit') &&
        options.reasons.includes('custom-elements'),
      'bounded values/options and custom coverage'
    );
    await probe.setContent(
      '<fieldset><legend>Work arrangement</legend><label>Remote<input type="radio" name="one"></label></fieldset>' +
        '<fieldset><legend>Work arrangement</legend><label>Remote<input type="radio" name="two"></label></fieldset>' +
        '<label>Tools<select multiple><option selected>Rust</option></select></label>' +
        '<label>Mixed<input type="checkbox" id="mixed"></label>' +
        '<div contenteditable="true" aria-label="Recent experience">Reviewed text</div>' +
        '<input type="password" role="combobox" aria-label="Password" value="omitted">' +
        '<div aria-disabled="true"><div role="checkbox" aria-label="Disabled group" aria-checked="false">Disabled</div></div>'
    );
    await probe.locator('#mixed').evaluate((control) => {
      control.indeterminate = true;
    });
    const states = await probe.evaluate(readFormDocument, {});
    assert(
      states.fields[0].group.id !== states.fields[1].group.id &&
        states.fields[2].multiple &&
        states.fields[3].indeterminate &&
        states.fields[4].type === 'contenteditable' &&
        states.fields[5].type === 'password' &&
        states.fields[5].value === null &&
        states.fields[6].disabled,
      'duplicate group labels and native mixed/multiple/editable states stay distinct'
    );
  } finally {
    await probe.close();
  }
};

const formGroups = {
  'forms-assignment': [
    verifyFormAssignmentUi,
    verifyAssignmentSourceDocument,
    verifyAssignmentPublicationUi,
  ],
  'forms-learning': [
    verifyFormJournalUi,
    verifyFormMonitorUi,
    verifyFormLearningUi,
    verifyFormCapacityUi,
    verifyFormModelUi,
  ],
  'forms-answers': [
    verifyFormLinksUi,
    verifyFormTimezoneUi,
    verifyFormSubjectsUi,
    verifyFormPayUi,
    verifyFormMatchingUi,
    verifyFormAutomaticUi,
    verifyFormCaptchaUi,
  ],
};

const runFormChecks = async (checks) => {
  for (const verify of checks) {
    const started = Date.now();
    console.log('[forms-scenario]', verify.name, 'started');
    await verify({
      ...app,
      owned,
      fixture,
      store,
      modelCalls,
      publication,
      sourceReads,
    });
    console.log('[forms-scenario]', verify.name, Date.now() - started);
  }
};

const verifyGroupOnly = async ({ page }) => {
  const group = process.env.FORMS_GROUP;
  if (group && group !== 'forms-reader') {
    assert(formGroups[group], 'known Forms browser group');
    await page.locator('[data-form-slot]').fill('application-2');
    await page.locator('[data-form-url]').fill(fixture.url);
    await runFormChecks(formGroups[group]);
    assert(
      owned.every((record) => record.closed),
      'group browsers close'
    );
    return true;
  }
  return false;
};

const verifyCustomOnly = async ({ page, until }) => {
  const contactScenario = [
    ['PUBLICATION', verifyAssignmentPublicationUi],
    ['ASSIGNMENT', verifyFormAssignmentUi],
    ['CAPTCHA', verifyFormCaptchaUi],
    ['AUTOMATIC', verifyFormAutomaticUi],
    ['MATCHING', verifyFormMatchingUi],
    ['PAY', verifyFormPayUi],
    ['SUBJECTS', verifyFormSubjectsUi],
    ['TIMEZONE', verifyFormTimezoneUi],
    ['LINKS', verifyFormLinksUi],
  ].find(([name]) => process.env[`FORMS_${name}_ONLY`] === '1');
  if (contactScenario) {
    await contactScenario[1]({
      ...app,
      owned,
      fixture,
      store,
      publication,
      sourceReads,
    });
    return true;
  }
  if (process.env.FORMS_POST_LEARNING_ONLY === '1') {
    await page.locator('[data-form-slot]').fill('application-2');
    await page.locator('[data-form-url]').fill(fixture.url);
    await runFormChecks([
      verifyFormLearningUi,
      verifyFormCapacityUi,
      verifyFormModelUi,
    ]);
    assert(
      fixture.submits === 1 && owned.every((record) => record.closed),
      'only learning submits once and every browser closes'
    );
    console.log(
      '[forms-post-learning]',
      JSON.stringify({ submits: fixture.submits, closed: owned.length })
    );
    return true;
  }
  if (process.env.FORMS_PREFILL_ONLY === '1') {
    await verifyFormPrefillUi({ page, owned, fixture });
    return true;
  }
  if (process.env.FORMS_MODEL_ONLY === '1') {
    await verifyFormModelUi({ ...app, owned, fixture, store, modelCalls });
    return true;
  }
  if (process.env.FORMS_CAPACITY_ONLY === '1') {
    await page.locator('[data-form-slot]').fill('application-2');
    await page.locator('[data-form-url]').fill(fixture.url);
    await verifyFormCapacityUi({ page, base: app.base, owned, fixture, until });
    return true;
  }
  if (
    [
      'CUSTOM',
      'CHOICES',
      'UPLOAD',
      'CONFIGURED_RESUME',
      'JOURNAL',
      'MONITOR',
      'LEARNING',
    ].some((name) => process.env[`FORMS_${name}_ONLY`] === '1')
  ) {
    await page.locator('[data-form-slot]').fill('application-2');
    await page.locator('[data-form-url]').fill(fixture.url);
    await until(
      () => page.locator('[data-action="open-form-review"]').isEnabled(),
      'Forms custom browser capability'
    );
    await (
      process.env.FORMS_CONFIGURED_RESUME_ONLY === '1'
        ? verifyFormConfiguredResumeUi
        : process.env.FORMS_LEARNING_ONLY === '1'
          ? verifyFormLearningUi
          : process.env.FORMS_MONITOR_ONLY === '1'
            ? verifyFormMonitorUi
            : process.env.FORMS_JOURNAL_ONLY === '1'
              ? verifyFormJournalUi
              : process.env.FORMS_UPLOAD_ONLY === '1'
                ? verifyFormUploadUi
                : process.env.FORMS_CHOICES_ONLY === '1'
                  ? verifyFormChoicesUi
                  : verifyFormCustomUi
    )({ page, owned, fixture, until, store });
    return true;
  }
  return false;
};

await app.finish(async () => {
  try {
    const { page, base, until } = app;
    await page.goto(
      `${base}/#/${process.env.FORMS_READER_BEFORE === '1' ? 'cv' : 'forms'}`
    );
    const nav = page.locator('button[data-view="forms"]');
    if (process.env.FORMS_READER_BEFORE === '1') {
      await page.locator('button[data-view="cv"]').waitFor();
      await page.screenshot({
        path: 'docs/screenshots/issue-56-forms-reader-before.png',
      });
      assert(await nav.count(), 'shared Forms navigation exists');
      return;
    }
    await nav.click();
    if ((await verifyGroupOnly(app)) || (await verifyCustomOnly(app))) {
      return;
    }
    await page.locator('[data-form-slot]').fill('bad slot');
    assert(
      await page
        .locator('[data-form-slot]')
        .evaluate((input) => !input.checkValidity()),
      'browser rejects an invalid slot before a read'
    );
    await page.locator('[data-form-url]').fill(fixture.url);
    await page.locator('[data-form-slot]').fill('application-2');
    const read = page.locator('[data-action="read-form"]');
    await until(() => read.isEnabled(), 'Forms browser capability');
    const reply = page.waitForResponse((response) =>
      response.url().endsWith('/api/forms/read')
    );
    await read.click();
    const report = await (
      await import('../src/transport/lino.js')
    ).decodeWire(
      await (await reply).body(),
      (await reply).headers()['content-type']
    );
    verifyReport(report);
    verifyReadOnly(report);
    await page.locator('[data-form-report="partial"]').waitFor();
    assert(
      (await page.locator('[data-form-field]').count()) === 15,
      'UI displays all inspected fields'
    );
    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-action="download-form-report"]').click();
    const download = await downloadPromise;
    assert(
      download.suggestedFilename().startsWith('form-inspection-'),
      'report export'
    );
    const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
    assert(
      exported.fields.length === report.fields.length &&
        exported.mode === 'read-only',
      'download contains the actual snapshot'
    );
    await verifyFormPlanUi({ page, report, owned });
    if (process.env.FORMS_PLAN_ONLY === '1') {
      return;
    }
    await page.locator('[data-form-report]').scrollIntoViewIfNeeded();
    if (process.env.FORMS_READER_SCREENSHOTS === '1') {
      await page.screenshot({
        path: 'docs/screenshots/issue-56-forms-reader-after.png',
      });
    }
    await page.route('**/api/forms/read', (route) =>
      fulfil(route, { ok: false, code: 'form-changed' }, 400)
    );
    await read.click();
    await page.locator('[data-form-error="form-changed"]').waitFor();
    assert(
      (await page.locator('[data-form-url]').inputValue()) === fixture.url &&
        (await page.locator('[data-form-field]').count()) === 15,
      'refusal preserves URL and last report'
    );
    await page.unroute('**/api/forms/read');
    await read.click();
    await until(() => read.isEnabled(), 'retry finishes');
    assert(
      (await page.locator('[data-form-error]').count()) === 0 &&
        owned.length === 2,
      'explicit retry recovers'
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.forms-view h1').scrollIntoViewIfNeeded();
    assert(
      await page.evaluate(
        () =>
          globalThis.document.documentElement.scrollWidth <=
          globalThis.innerWidth
      ),
      'form report fits phone viewport'
    );
    if (process.env.FORMS_READER_SCREENSHOTS === '1') {
      await page.screenshot({
        path: 'docs/screenshots/issue-56-forms-reader-mobile.png',
      });
    }
    await verifyLimits(page);
    await runFormChecks([
      verifyFormReviewUi,
      verifyFormPrefillUi,
      verifyFormRadioUi,
      verifyFormCustomUi,
      verifyFormChoicesUi,
      verifyFormUploadUi,
      verifyFormConfiguredResumeUi,
      ...(process.env.FORMS_GROUP === 'forms-reader'
        ? []
        : Object.values(formGroups).flat()),
    ]);
    await page.route('**/api/forms/capabilities', (route) =>
      fulfil(route, { available: false, read: false })
    );
    await page.reload();
    await until(() => read.isDisabled(), 'unavailable form reader disabled');
    await page
      .getByText(
        'Connect a server with browser automation to inspect a form.',
        { exact: true }
      )
      .waitFor();
  } finally {
    await publication.publisher.stop();
    await fixture.close();
  }
});

// CDP watchers use Chromium; the shared form reader is checked in both engines.
if (
  !formGroups[process.env.FORMS_GROUP] &&
  process.env.E2E_BROWSER !== 'webkit' &&
  process.env.FORMS_LEARNING_ONLY !== '1' &&
  process.env.FORMS_POST_LEARNING_ONLY !== '1' &&
  process.env.FORMS_CAPACITY_ONLY !== '1' &&
  process.env.FORMS_MODEL_ONLY !== '1' &&
  process.env.FORMS_LINKS_ONLY !== '1' &&
  process.env.FORMS_TIMEZONE_ONLY !== '1' &&
  process.env.FORMS_SUBJECTS_ONLY !== '1' &&
  process.env.FORMS_PAY_ONLY !== '1' &&
  process.env.FORMS_MATCHING_ONLY !== '1' &&
  process.env.FORMS_CAPTCHA_ONLY !== '1' &&
  process.env.FORMS_AUTOMATIC_ONLY !== '1' &&
  process.env.FORMS_PREFILL_ONLY !== '1' &&
  process.env.FORMS_PUBLICATION_ONLY !== '1' &&
  process.env.FORMS_CONFIGURED_RESUME_ONLY !== '1'
) {
  await import('./e2e-forms-watcher-browser.mjs');
}
