import { createMemoryStore } from '../src/storage/universal.js';
import { assert, openChatApp } from './helpers/e2e-chat.mjs';
import { decoded } from './helpers/e2e-form-review.mjs';
import { TUTORIAL_STORAGE_KEY, TUTORIAL_VERSION } from '../src/web/tutorial.js';
import {
  seedChatModel,
  modelText,
} from '../../experiments/issue-56/chat-model-fixture.mjs';

const store = createMemoryStore();
const fixture = await seedChatModel(store, { split: false });
const sent = [];
const { page, base, until, finish } = await openChatApp('chat-model', {
  store,
  send: async (draft) => {
    sent.push(draft);
    return { via: 'fixture' };
  },
  serverOptions: {
    answerModel: { draft: fixture.runner, stop: async () => {} },
  },
});
await page.addInitScript(
  ({ key, version }) => {
    globalThis.localStorage.setItem(
      key,
      JSON.stringify({ off: true, v: version })
    );
    globalThis.localStorage.setItem('metaSovereignLocale', 'en');
  },
  { key: TUTORIAL_STORAGE_KEY, version: TUTORIAL_VERSION }
);

const screenshot = async (name, locator) => {
  if (!process.env.CHAT_MODEL_SCREENSHOTS && !process.env.CHAT_MODEL_BEFORE) {
    return;
  }
  await locator.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `docs/screenshots/issue-56-chat-model-${name}.png`,
  });
};
await finish(async () => {
  await page.goto(`${base}/#/automation`);
  await page
    .locator('[data-automation="automation:model-chat"]')
    .first()
    .click();
  const editor = page.locator('form.automation-editor');
  const plan = page.locator('.automation-plan');
  const preview = async () => {
    const response = page.waitForResponse((r) =>
      r.url().endsWith('/api/automations/plan')
    );
    await editor.getByRole('button', { name: 'Preview', exact: true }).click();
    return decoded(await response);
  };
  const first = await preview();
  await plan.locator('blockquote').waitFor();
  await screenshot(process.env.CHAT_MODEL_BEFORE ? 'before' : 'after', plan);
  assert(
    fixture.calls.length === 1,
    'model drafts the unanswered part of a message with a saved answer'
  );
  assert(
    first.drafts[0].text.includes('My English level is B2.') &&
      first.drafts[0].text.includes(modelText),
    'saved and model answers share the reviewed reply'
  );
  assert(
    !first.drafts[0].text.includes('{{answer:'),
    'no unresolved placeholder is disguised as a complete answer'
  );
  assert(
    (await editor
      .getByRole('spinbutton', { name: 'Minimum similarity (%)' })
      .inputValue()) === '70',
    'editor displays the actual default chat threshold'
  );
  const optIn = editor.locator('[data-model-draft-opt-in]');
  assert(await optIn.isChecked(), 'saved explicit opt-in is visible');
  await optIn.uncheck();
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await until(
    async () =>
      (await store.get(fixture.automation.id)).action.modelDraft === false,
    'opt-out saved'
  );
  await preview();
  assert(fixture.calls.length === 1, 'opt-out does not invoke a model');
  await optIn.check();
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await until(
    async () =>
      (await store.get(fixture.automation.id)).action.modelDraft === true,
    'opt-in saved'
  );
  const response = page.waitForResponse((r) =>
    r.url().endsWith('/api/automations/run')
  );
  await editor.locator('[data-action="run-automation"]').click();
  const queued = await decoded(await response);
  assert(
    queued.queued.length === 1 && sent.length === 0,
    'run queues one reviewed draft with zero sends'
  );
  await page.goto(`${base}/#chat=hh:model-chat`);
  const card = page.locator('.draft-card');
  await card.waitFor();
  assert(
    (await card.locator('textarea').inputValue()).includes(modelText),
    'actual Chat draft contains model text'
  );
  await screenshot('chat', card.locator('textarea'));
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot('mobile', card.locator('textarea'));
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ),
    'review fits phone width'
  );
  await page.setViewportSize({ width: 1200, height: 800 });
  await card.locator('[data-answer-parts] > summary').click();
  await screenshot('evidence', card.locator('[data-answer-parts]'));
  await card.locator('textarea').fill('Owner keeps this reviewed edit.');
  await page.locator('[data-action="draft-close"]').click();
  await card.waitFor({ state: 'detached' });
  assert(
    (await store.get(queued.queued[0].id)).status === 'pending',
    'dismissal retains pending draft'
  );
  const callsBeforeReuse = fixture.calls.length;
  await page.locator('[data-action="chat-automations"]').click();
  await page
    .locator(
      '[data-action="chat-automation-test"][data-automation="automation:model-chat"]'
    )
    .click();
  await card.waitFor();
  assert(
    (await card.locator('textarea').inputValue()) ===
      'Owner keeps this reviewed edit.',
    'reopening retains owner text'
  );
  assert(
    fixture.calls.length === callsBeforeReuse,
    'pending draft recovery makes no model request'
  );
  assert(sent.length === 0, 'the browser never sends a message');
  console.log(
    '[chat-model]',
    JSON.stringify({
      modelCalls: fixture.calls.length,
      queued: queued.queued.length,
      ownerEditRetained: true,
      sends: sent.length,
      phoneOverflow: false,
    })
  );
});
