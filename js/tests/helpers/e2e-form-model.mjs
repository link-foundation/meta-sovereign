import { assert } from './e2e-chat.mjs';
import { responseFor, decoded, planCurrent } from './e2e-form-review.mjs';
import {
  seedModelAnswers,
  modelText,
} from '../../../experiments/issue-56/forms-model-fixture.mjs';
import { saveAnswerModel } from '../../src/automation/answer-model-config.js';
import { inputTrace } from './e2e-input-trace.mjs';

const capture = async (page, name, selector = '[data-form-plan-summary]') => {
  if (
    process.env.FORMS_MODEL_SCREENSHOTS === '1' ||
    process.env.FORMS_PLAIN_SCREENSHOTS === '1'
  ) {
    await page
      .locator(selector)
      .evaluate((element) => element.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => globalThis.scrollBy(0, -72));
    await page.screenshot({
      path: `docs/screenshots/issue-56-forms-${process.env.FORMS_PLAIN_SCREENSHOTS === '1' ? 'plain' : 'model'}-${name}.png`,
    });
  }
};
const configureModel = async ({ page, store, until }) => {
  const { settings } = await seedModelAnswers(store);
  const panel = page.locator('[data-answer-model-settings]');
  if (process.env.FORMS_MODEL_BEFORE === '1') {
    await page.locator('.forms-view h1').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'docs/screenshots/issue-56-forms-model-before.png',
    });
    assert(await panel.count(), 'model configuration is available');
    return;
  }
  await panel.locator('summary').click();
  const name = page.locator('[data-answer-model-name]');
  let release;
  let started;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const began = new Promise((resolve) => {
    started = resolve;
  });
  const route = async (request) => {
    if (request.request().method() === 'GET') {
      started();
      await gate;
    }
    await request.continue();
  };
  await page.route('**/api/automations/answers/model', route);
  try {
    await page.locator('[data-reload-answer-model]').click();
    await began;
    assert(await name.isDisabled(), 'pending model reload disables edits');
    assert(
      await page.locator('[data-save-answer-model]').isDisabled(),
      'pending model reload cannot save'
    );
  } finally {
    release();
  }
  await until(() => name.isEnabled(), 'model configuration loaded');
  await page.unroute('**/api/automations/answers/model', route);
  await name.fill('fixture-model');
  let pending = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/automations/answers/model') &&
      response.request().method() === 'POST'
  );
  await page.locator('[data-save-answer-model]').click();
  const saved = (await decoded(await pending)).settings;
  assert(
    saved.cvId === 'cv:model-fixture' &&
      saved.enabled &&
      saved.model === 'fixture-model',
    `explicit CV and model settings acknowledged: ${JSON.stringify(await inputTrace(page))}`
  );
  await page.reload();
  await panel.locator('summary').click();
  await until(
    async () => (await name.inputValue()) === 'fixture-model',
    'model configuration survives reload'
  );
  if (process.env.FORMS_MODEL_RELOAD_SCREENSHOTS === '1') {
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'docs/screenshots/issue-56-model-reload-after.png',
    });
  }
  await saveAnswerModel(store, { ...saved, model: 'external-fixture-model' });
  await name.fill('Owner edited model');
  pending = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/automations/answers/model') &&
      response.request().method() === 'POST'
  );
  await page.locator('[data-save-answer-model]').click();
  assert(
    (await decoded(await pending)).code === 'answer-model-config',
    'invalid model alias refused'
  );
  await page.locator('[data-reload-answer-model]').click();
  await until(
    async () => (await name.inputValue()) === 'external-fixture-model',
    'configuration recovery'
  );
  const current = await saveAnswerModel(store, {
    ...settings,
    revision: (await store.get('config:answer-model')).revision,
    model: 'another-fixture-model',
  });
  await name.fill('owner-edited-model');
  await page.locator('[data-save-answer-model]').click();
  await page
    .locator('[data-answer-model-error="answer-model-changed"]')
    .waitFor();
  assert(
    (await name.inputValue()) === 'owner-edited-model',
    'stale model save preserves owner input'
  );
  await capture(page, 'stale', '[data-answer-model-settings]');
  await page.locator('[data-reload-answer-model]').click();
  await until(
    async () => (await name.inputValue()) === current.model,
    'explicit reload recovers actual model settings'
  );
};

export const verifyFormModelUi = async ({
  page,
  owned,
  fixture,
  until,
  store,
  modelCalls,
}) => {
  const initialSubmits = fixture.submits;
  await configureModel({ page, store, until });
  await page
    .locator('[data-form-url]')
    .fill(fixture.url.replace('/application', '/model'));
  await page.locator('[data-form-slot]').fill('application-2');
  let pending = responseFor(page, 'open');
  await page.locator('[data-action="open-form-review"]').click();
  await decoded(await pending);
  const owner = owned.at(-1);
  pending = responseFor(page, 'read');
  await page.locator('[data-review-action="read"]').click();
  await decoded(await pending);
  await page
    .locator('[data-form-profile]')
    .selectOption('qa-profile:model-fixture');
  const planner = page.locator('[data-form-planner]');
  await planner.locator('[data-model-draft-opt-in]').check();
  const before = modelCalls.length;
  const plan = await planCurrent(page);
  const drafted = plan.fields.find((field) => field.name === 'background');
  const unknown = plan.fields.find((field) => field.name === 'starting');
  if (process.env.FORMS_PLAIN_BEFORE === '1') {
    await page
      .locator(`[data-form-field="${drafted.id}"]`)
      .evaluate((element) => element.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => globalThis.scrollBy(0, -72));
    await page.screenshot({
      path: 'docs/screenshots/issue-56-forms-plain-before.png',
    });
  }
  assert(
    drafted.answer.source === 'model' &&
      drafted.answer.proposal.value === modelText,
    'selected CV produces a reviewed proposal'
  );
  assert(
    unknown.answer.proposal === null &&
      unknown.answer.text.includes('[clarify:'),
    'unknown commitment requires owner clarification'
  );
  assert(
    (await page.locator(`[data-form-select="${unknown.id}"]`).count()) === 0,
    'unknown fact cannot be selected for a field write'
  );
  assert(modelCalls.length === before + 1, 'one bounded model call per plan');
  await page.locator(`[data-form-select="${drafted.id}"]`).check();
  await capture(page, 'after', `[data-form-field="${drafted.id}"]`);
  assert(
    (await page.locator('[data-form-model-draft]').textContent()).includes(
      '[clarify:'
    ),
    'clarification is displayed'
  );
  await capture(page, 'clarification', `[data-form-field="${unknown.id}"]`);
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ),
    'model drafts fit a phone'
  );
  await capture(page, 'mobile', `[data-form-field="${drafted.id}"]`);
  await page.setViewportSize({ width: 1200, height: 800 });
  pending = responseFor(page, 'apply');
  await page.locator('[data-action="apply-form-plan"]').click();
  const applied = await decoded(await pending);
  assert(
    applied.state === 'applied' && applied.receipts[0].status === 'applied',
    'model field has a real readback receipt'
  );
  assert(
    modelCalls.length === before + 1,
    'apply revalidates frozen context without repeating a model call'
  );
  assert(
    (await owner.page.locator('[name="background"]').inputValue()) ===
      modelText,
    'reviewed draft written'
  );
  assert(
    (await owner.page.locator('[name="fullName"]').inputValue()) ===
      'Owner retains this answer',
    'unselected owner answer preserved'
  );
  await page.locator('[data-review-action="close"]').click();
  await until(
    async () => (await page.locator('[data-form-review]').count()) === 0,
    'model review closed'
  );
  assert(
    owner.closed && fixture.submits === initialSubmits,
    'model review closes its browser without adding submissions'
  );
  console.log(
    '[forms-model]',
    JSON.stringify({
      calls: modelCalls.length - before,
      applied: true,
      clarification: true,
      stalePreserved: true,
      ownerPreserved: true,
      closed: owner.closed,
      submits: fixture.submits - initialSubmits,
    })
  );
};
