import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { assert } from './e2e-chat.mjs';
import {
  openFormPlan,
  planCurrent,
  applyCurrent,
  closeFormReview,
  captureFormField,
  captureFormFieldLayouts,
} from './e2e-form-review.mjs';
import {
  saveAnswerModel,
  readAnswerModel,
} from '../../src/automation/answer-model-config.js';
import { privateModelMarkdown } from '../../../experiments/issue-56/forms-private-model-fixture.mjs';
import { modelText } from '../../../experiments/issue-56/forms-model-fixture.mjs';

const background = (plan) =>
  plan.fields.find((field) => field.name === 'background');

const verifyPrivateDraft = (plan, calls) => {
  assert(
    calls.at(-1).context.cv?.values.markdown === privateModelMarkdown,
    'the model receives the complete private resume without a stored CV'
  );
  assert(
    background(plan).answer.proposal?.value === modelText &&
      background(plan).answer.evidence.includes('resume/resume.md'),
    'private CV draft retains provenance'
  );
};

/** Private conventional CV, explicit opt-in and actual native draft readback. */
export const verifyFormPrivateModelUi = async ({
  page,
  owned,
  fixture,
  store,
  until,
  modelCalls,
}) => {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'forms-private-model-ui-')
  );
  const original = store.logFile;
  const saved = await store.get('config:answer-model');
  const submissions = fixture.submits;
  let owner;
  store.logFile = path.join(directory, 'data.lino');
  try {
    await mkdir(path.join(directory, 'resume'));
    const file = path.join(directory, 'resume/resume.md');
    await writeFile(file, privateModelMarkdown);
    await saveAnswerModel(store, {
      ...(await readAnswerModel(store)),
      enabled: true,
      cvId: '',
    });
    await openFormPlan(page, fixture.url.replace('/application', '/model'));
    owner = owned.at(-1);
    await page.locator('[data-form-planner] [data-model-draft-opt-in]').check();
    const calls = modelCalls.length;
    let plan = await planCurrent(page);
    if (process.env.FORMS_PRIVATE_MODEL_BEFORE === '1') {
      assert(
        !background(plan).answer.proposal,
        'parent lacks private CV model context'
      );
      await captureFormField(
        page,
        background(plan).id,
        'before',
        'private_model'
      );
      console.log(
        '[forms-private-model-before]',
        JSON.stringify({
          privateResume: true,
          selectedCv: '',
          proposal: null,
          submissions: fixture.submits - submissions,
        })
      );
      return;
    }
    verifyPrivateDraft(plan, modelCalls);
    const unknown = plan.fields.find((field) => field.name === 'starting');
    assert(
      !unknown.answer.proposal && unknown.answer.missing.length,
      'unknown owner fact remains unselectable'
    );
    await page.locator(`[data-form-select="${background(plan).id}"]`).check();
    await writeFile(file, `${privateModelMarkdown}\nChanged experience.\n`);
    const refused = await applyCurrent(page);
    assert(
      refused.state === 'refused' &&
        refused.code === 'form-answers-changed' &&
        (await owner.page.locator('[name="background"]').inputValue()) === '',
      'changed private CV refuses before native typing'
    );
    plan = await planCurrent(page);
    await page.locator(`[data-form-select="${background(plan).id}"]`).check();
    await captureFormFieldLayouts(page, background(plan).id, 'private_model');
    const applied = await applyCurrent(page);
    assert(
      applied.state === 'applied' &&
        applied.receipts[0]?.status === 'applied' &&
        modelCalls.length === calls + 2 &&
        (await owner.page.locator('[name="background"]').inputValue()) ===
          modelText,
      'replanning makes one new model call and apply reads back the frozen draft'
    );
    assert(
      (await owner.page.locator('[name="fullName"]').inputValue()) ===
        'Owner retains this answer' &&
        (await owner.page.locator('[name="starting"]').inputValue()) === '' &&
        fixture.submits === submissions,
      'owner answer and unknown fact remain unchanged without submission'
    );
    await closeFormReview(page, until, 'private model review closes');
    console.log(
      '[forms-private-model]',
      JSON.stringify({
        source: 'resume/resume.md',
        selectedCv: '',
        modelCalls: modelCalls.length - calls,
        changedSourceRefused: refused.code,
        nativeReceipts: 1,
        unknownPreserved: true,
        ownerPreserved: true,
        submissions: fixture.submits - submissions,
        closed: owner.closed,
      })
    );
  } finally {
    if (owner && !owner.closed) {
      await closeFormReview(page, until, 'private model cleanup closes');
    }
    if (saved) {
      await store.put(saved);
    } else {
      await store.delete('config:answer-model');
    }
    store.logFile = original;
    await rm(directory, { recursive: true, force: true });
  }
};
