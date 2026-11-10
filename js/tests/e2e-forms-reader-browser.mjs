import { seedFormAnswers } from '../../experiments/issue-56/forms-plan-fixture.mjs';
import { verifyFormPlanUi } from './helpers/e2e-form-plans.mjs';
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, openChatApp, fulfil } from './helpers/e2e-chat.mjs';
import { makeBrowserCommander } from 'browser-commander';
import { startFormsFixture } from '../../experiments/issue-56/forms-reader-fixture.mjs';
import { readFormDocument } from '../src/forms/read-document.js';
import { readFile } from 'node:fs/promises';
import { TUTORIAL_STORAGE_KEY, TUTORIAL_VERSION } from '../src/web/tutorial.js';

const fixture = await startFormsFixture();
const store = createMemoryStore();
await seedFormAnswers(store);
const owned = [];
let app;
try {
  app = await openChatApp('forms-reader', {
    store,
    serverOptions: {
      forms: {
        availability: async () => ({
          available: true,
          missing: [],
          reason: null,
        }),
        openSession: async (options) => {
          assert(
            options.useCase === 'forms' && options.slot === 'application-2',
            'shared Forms slot/policy'
          );
          const context = await app.page.context().browser().newContext();
          const page = await context.newPage();
          const commander = makeBrowserCommander({
            page,
            enableNetworkTracking: false,
            enableNavigationManager: false,
            enableDialogManager: false,
          });
          const record = { options, closed: false, events: [] };
          owned.push(record);
          return {
            page,
            commander,
            policy: { headless: true },
            async close() {
              for (const frame of page.frames()) {
                record.events.push(
                  ...(await frame.evaluate(() => globalThis.events ?? []))
                );
              }
              record.values = await page
                .locator('[name="experience"]')
                .inputValue();
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

await app.page.addInitScript(
  ({ key, value }) => globalThis.localStorage.setItem(key, value),
  {
    key: TUTORIAL_STORAGE_KEY,
    value: JSON.stringify({ off: true, v: TUTORIAL_VERSION }),
  }
);
const verifyReport = (report) => {
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
        '<div contenteditable="true" aria-label="Recent experience">Reviewed text</div>'
    );
    await probe.locator('#mixed').evaluate((control) => {
      control.indeterminate = true;
    });
    const states = await probe.evaluate(readFormDocument, {});
    assert(
      states.fields[0].group.id !== states.fields[1].group.id &&
        states.fields[2].multiple &&
        states.fields[3].indeterminate &&
        states.fields[4].type === 'contenteditable',
      'duplicate group labels and native mixed/multiple/editable states stay distinct'
    );
  } finally {
    await probe.close();
  }
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
        () => document.documentElement.scrollWidth <= globalThis.innerWidth
      ),
      'form report fits phone viewport'
    );
    if (process.env.FORMS_READER_SCREENSHOTS === '1') {
      await page.screenshot({
        path: 'docs/screenshots/issue-56-forms-reader-mobile.png',
      });
    }
    await verifyLimits(page);
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
    await fixture.close();
  }
});
