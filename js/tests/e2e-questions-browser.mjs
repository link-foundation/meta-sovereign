// Production Q/A controls with an isolated store and no provider sends.
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';
import { TUTORIAL_STORAGE_KEY, TUTORIAL_VERSION } from '../src/web/tutorial.js';
import { verifySalaryExchange } from './helpers/e2e-salary-exchange.mjs';
import { verifySalaryExchangePolicy } from './helpers/e2e-salary-exchange-policy.mjs';
import { verifySalaryBoth } from './helpers/e2e-salary-both.mjs';
import { verifyQuestionSubstitution } from './helpers/e2e-question-substitution.mjs';
import { verifyQuestionLanguage } from './helpers/e2e-question-language.mjs';

const store = createMemoryStore();
for (const [id, sender, body] of [
  [1, 'them', 'Какой у вас опыт?'],
  [2, 'me', 'Пять лет.'],
]) {
  await store.put({
    id: `msg:hh:1:${id}`,
    source: 'hh',
    chat: '1',
    sender,
    body,
    timestamp: `2026-11-09T10:00:0${id}Z`,
  });
}
const { page, base, until, finish } = await openChatApp('questions', { store });
const rtcConnections = [];
page.on('websocket', (socket) => {
  if (new URL(socket.url()).pathname === '/rtc') {
    rtcConnections.push(socket.url());
  }
});
const verifySyncCapability = () =>
  assert(
    rtcConnections.length === 0,
    'the disabled signaling broker receives no connection during browser boot'
  );
const panel = page.locator('[data-question-controls]');
const editor = panel.locator('[data-answer-rule]');
const rules = () => store.query((link) => link.id?.startsWith('qa-rule:'));
const showPanel = async () => {
  await page.goto(`${base}/#/automation`);
  await panel.locator(':scope > summary').click();
  await editor.waitFor();
};
const verifyLearning = async (saved) => {
  await panel
    .locator('summary')
    .filter({ hasText: 'Learn from conversations' })
    .click();
  await panel
    .getByRole('button', { name: 'Preview learned answers', exact: true })
    .click();
  await panel
    .getByRole('button', { name: 'Save proposals for review', exact: true })
    .waitFor();
  await panel
    .getByText('Archived messages inspected: 2 of 2.', { exact: true })
    .waitFor();
  await panel.getByText('Observed answer turns: 1', { exact: true }).waitFor();
  assert((await rules()).length === 1, 'learning preview never writes');
  await panel
    .getByRole('button', { name: 'Save proposals for review', exact: true })
    .click();
  await until(async () => (await rules()).length === 2, 'proposals persisted');
  const learned = (await rules()).find((rule) => rule.id !== saved.id);
  assert(
    !learned.answers[0].approved && learned.answers[0].count === 1,
    'learning preserves observed evidence without granting approval'
  );
};

const saveInitialRule = async () => {
  await editor
    .getByLabel('Question or pattern', { exact: true })
    .fill('Где вы живете?');
  await editor
    .getByLabel('Equivalent questions, one per line')
    .fill('В каком городе живете?');
  await editor.getByLabel('Answer', { exact: true }).fill('Живу в {{city}}.');
  await editor
    .getByRole('checkbox', { name: 'Approved for automatic sending' })
    .check();
  await editor
    .getByRole('checkbox', {
      name: 'Use this correction instead of older variants',
    })
    .check();
  await editor
    .getByLabel('Providers, comma-separated')
    .fill('hh, telegram, vk');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await until(
    async () => (await rules()).length === 1,
    'rule saved through the production API'
  );
  const saved = (await rules())[0];
  assert(
    saved.answers[0].approved &&
      saved.answers[0].canonical &&
      saved.answers[0].count === 0,
    'manual correction carries no invented frequency'
  );
  return saved;
};

const verifyPolicy = async () => {
  const policy = panel.locator('[data-answer-policy]');
  await policy.locator(':scope > summary').click();
  const field = policy.getByLabel('Rejected phrases, one per line');
  await field.fill('A rejected historical response.');
  await policy
    .getByRole('checkbox', {
      name: 'Combine frequencies of answers differing only by final punctuation',
    })
    .check();
  await policy.getByRole('button', { name: 'Save', exact: true }).click();
  await policy
    .getByText('Answer reuse policy saved.', { exact: true })
    .waitFor();
  assert(
    (await store.get('qa-policy:reuse')).punctuationEquivalent,
    'policy saved in shared store'
  );
  if (process.env.QUESTIONS_POLICY_SCREENSHOT) {
    await page.setViewportSize({ width: 1200, height: 1100 });
    await policy.evaluate((element) =>
      element.scrollIntoView({ block: 'center' })
    );
    await page.screenshot({
      path: process.env.QUESTIONS_POLICY_SCREENSHOT,
      scale: 'css',
    });
  }
  await page.route('**/api/automations/answers/policy', (route) =>
    fulfil(route, { error: 'Policy fixture refusal', status: 'failed' }, 500)
  );
  await field.fill('Keep this rejection pending');
  await policy.getByRole('button', { name: 'Save', exact: true }).click();
  await panel
    .getByRole('alert')
    .filter({ hasText: 'Policy fixture refusal' })
    .waitFor();
  assert(
    (await field.inputValue()) === 'Keep this rejection pending',
    'failed policy save retains the edit'
  );
  assert(
    (await store.get('qa-policy:reuse')).rejected[0] ===
      'A rejected historical response.',
    'failed policy save never changes stored policy'
  );
  await page.unroute('**/api/automations/answers/policy');
};

const verifyContexts = async (preview) => {
  const contexts = preview.locator('[data-answer-contexts]');
  await contexts.locator(':scope > summary').click();
  await contexts
    .getByRole('button', { name: 'Add context group', exact: true })
    .click();
  const group = contexts.locator('[data-context-group]');
  await group
    .getByLabel('Context field, e.g. currency', { exact: true })
    .fill('location');
  const configure = async (index, id, keyword, city) => {
    const choice = group.locator('[data-context-choice]').nth(index);
    await choice.getByLabel('Choice value, e.g. USD', { exact: true }).fill(id);
    await choice
      .getByLabel('Words that select this choice, one per line', {
        exact: true,
      })
      .fill(keyword);
    const fields = choice.locator('[data-answer-profile]');
    await fields
      .getByLabel('Field name, e.g. city', { exact: true })
      .fill('city');
    await fields
      .getByRole('button', { name: 'Add field', exact: true })
      .click();
    await fields.getByLabel('city', { exact: true }).fill(city);
  };
  await configure(0, 'home', 'home', 'Hanoi');
  await group
    .getByRole('button', { name: 'Add context choice', exact: true })
    .click();
  await configure(1, 'remote', 'remote', 'Da Nang');
  await group
    .getByLabel('Default when context is absent', { exact: true })
    .selectOption('home');
  await preview
    .getByRole('button', { name: 'Preview answer', exact: true })
    .click();
  await preview
    .locator('[data-answer-preview]')
    .getByText('Живу в Hanoi.', { exact: true })
    .waitFor();
  const environment = preview.locator('[data-answer-environment]');
  await environment.locator(':scope > summary').click();
  await environment
    .getByLabel('Recent messages, newest first, one per line', { exact: true })
    .fill('This is a remote role.');
  await preview
    .getByRole('button', { name: 'Preview answer', exact: true })
    .click();
  await preview
    .locator('[data-answer-preview]')
    .getByText('Живу в Da Nang.', { exact: true })
    .waitFor();
  const evidence = preview.locator('[data-answer-context-evidence]');
  await evidence.locator(':scope > summary').click();
  await evidence
    .getByText('location: remote · Recent conversation', { exact: true })
    .waitFor();
  if (process.env.QUESTIONS_CONTEXT_SCREENSHOT) {
    await page.setViewportSize({ width: 1200, height: 1100 });
    await environment.evaluate((element) =>
      element.scrollIntoView({ block: 'center' })
    );
    await page.screenshot({
      path: process.env.QUESTIONS_CONTEXT_SCREENSHOT,
      scale: 'css',
    });
  }
  if (process.env.QUESTIONS_CONTEXT_MOBILE_SCREENSHOT) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.app-shell-compact').waitFor();
    await contexts.evaluate((element) =>
      element.scrollIntoView({ block: 'start' })
    );
    await page.screenshot({
      path: process.env.QUESTIONS_CONTEXT_MOBILE_SCREENSHOT,
      scale: 'css',
    });
    await page.setViewportSize({ width: 1200, height: 1100 });
    await page.locator('.app-shell-compact').waitFor({ state: 'detached' });
  }
};

const verifyMobile = async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.app-shell-compact').waitFor();
  const layout = await page.evaluate(async () => {
    // The responsive shell updates on resize; inspect its painted layout.
    await new Promise((resolve) =>
      globalThis.requestAnimationFrame(() =>
        globalThis.requestAnimationFrame(resolve)
      )
    );
    return {
      width: globalThis.innerWidth,
      scroll: document.documentElement.scrollWidth,
      overflow: [...document.querySelectorAll('*')]
        .filter(
          (element) =>
            element.getBoundingClientRect().right > globalThis.innerWidth + 1
        )
        .slice(0, 12)
        .map((element) => ({
          tag: element.tagName,
          class: element.className,
          width: element.getBoundingClientRect().width,
          minWidth: globalThis.getComputedStyle(element).minWidth,
        })),
    };
  });
  assert(
    layout.scroll <= layout.width,
    `question controls fit a mobile viewport: ${JSON.stringify(layout)}`
  );
  if (process.env.QUESTIONS_MOBILE_SCREENSHOT) {
    await editor.getByLabel('Answer', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: process.env.QUESTIONS_MOBILE_SCREENSHOT,
      scale: 'css',
    });
  }
};

const verifySalaryCalculation = async (
  preview,
  salary,
  currency,
  run,
  result
) => {
  // Configure a calculation through the same visible controls used by saved actions.
  // These are fixture rates supplied by the owner, not jurisdiction defaults.
  await currency
    .getByLabel('Gross amount method', { exact: true })
    .selectOption('personal');
  assert(
    await currency
      .getByLabel('Monthly gross amount', { exact: true })
      .isDisabled(),
    'selected calculation ignores the old explicit gross amount'
  );
  const tax = salary.locator('[data-salary-tax="personal"]');
  await tax.locator(':scope > summary').click();
  await tax
    .getByRole('button', { name: 'Configure tax schedule', exact: true })
    .click();
  await tax.getByLabel('Personal tax currency', { exact: true }).fill('RUB');
  const addBand = () =>
    tax
      .getByRole('button', { name: 'Add limited tax band', exact: true })
      .click();
  await addBand();
  await addBand();
  const bands = tax.locator('[data-salary-tax-band]');
  for (const [index, limit, rate] of [
    [0, '2400000', '13'],
    [1, '5000000', '15'],
    [2, null, '18'],
  ]) {
    if (limit) {
      await bands
        .nth(index)
        .getByLabel('Annual gross upper limit', { exact: true })
        .fill(limit);
    }
    await bands
      .nth(index)
      .getByLabel('Tax rate (%)', { exact: true })
      .fill(rate);
  }
  await preview
    .getByLabel('Question or pattern', { exact: true })
    .fill('What salary in USD before taxes do you expect?');
  await run();
  await result
    .getByText('Missing profile values: salary_exchange_USD_RUB', {
      exact: true,
    })
    .waitFor();
  await result
    .getByText('Review required before automatic sending.', { exact: true })
    .waitFor();
  const exchange = salary.locator('[data-salary-exchange]');
  await exchange.locator(':scope > summary').click();
  await exchange
    .getByRole('button', { name: 'Configure exchange rates', exact: true })
    .click();
  await exchange
    .getByLabel('Exchange base currency', { exact: true })
    .fill('RUB');
  await exchange
    .getByRole('button', { name: 'Add exchange rate', exact: true })
    .click();
  const rate = exchange.locator('[data-salary-exchange-rate]');
  await rate.getByLabel('Currency code, e.g. USD', { exact: true }).fill('USD');
  await rate
    .getByLabel('Base units per one currency unit', { exact: true })
    .fill('84.9048');
  await run();
  await result
    .getByText('From $7 100 gross per month.', { exact: true })
    .waitFor();
  await result.getByText('Approved and complete.', { exact: true }).waitFor();
  const calculation = result.locator('[data-salary-calculation-evidence]');
  await calculation.locator(':scope > summary').click();
  await calculation
    .getByText('Progressive personal tax · 13% / 15% / 18%', { exact: true })
    .waitFor();
  await calculation
    .getByText(
      `Dated exchange rates: Owner-supplied rates · ${new Date().toISOString().slice(0, 10)} · RUB`,
      { exact: true }
    )
    .waitFor();
  // Keep the relevant settings and their result together for review.
  await tax.locator(':scope > summary').click();
  await exchange.locator(':scope > summary').click();
};

const verifySalary = async (preview) => {
  const salary = preview.locator('[data-answer-salary]');
  await salary.locator(':scope > summary').click();
  await salary
    .getByRole('checkbox', {
      name: 'Use configured salary targets',
      exact: true,
    })
    .check();
  const currency = salary.locator('[data-salary-currency]');
  await currency
    .getByLabel('Currency code, e.g. USD', { exact: true })
    .fill('USD');
  await currency
    .getByLabel('Currency words, comma-separated', { exact: true })
    .fill('USD, $');
  await currency.getByLabel('Monthly net amount', { exact: true }).fill('6000');
  await currency
    .getByLabel('Monthly gross amount', { exact: true })
    .fill('7100');
  await salary
    .getByLabel('Default salary currency', { exact: true })
    .selectOption('USD');
  await preview
    .getByLabel('Question or pattern', { exact: true })
    .fill('What hourly rate in USD do you expect?');
  const result = preview.locator('[data-answer-preview]');
  const run = () =>
    preview
      .getByRole('button', { name: 'Preview answer', exact: true })
      .click();
  await run();
  await result.getByText('From $40 net per hour.', { exact: true }).waitFor();
  await result
    .getByText('Review required before automatic sending.', { exact: true })
    .waitFor();
  await salary
    .getByRole('checkbox', {
      name: 'Approve complete salary answers for automatic sending',
      exact: true,
    })
    .check();
  await run();
  await result.getByText('Approved and complete.', { exact: true }).waitFor();
  const evidence = result.locator('[data-answer-context-evidence]');
  if ((await evidence.getAttribute('open')) === null) {
    await evidence.locator(':scope > summary').click();
  }
  await result
    .getByText('salary_currency: USD · Current question', { exact: true })
    .waitFor();
  await verifySalaryCalculation(preview, salary, currency, run, result);
  await verifySalaryExchange({ page, salary, run, result });
  await verifySalaryExchangePolicy({ page, salary, run, result, store });
  await verifySalaryBoth({ page, preview, salary, run, result });
  await page.setViewportSize({ width: 1200, height: 1100 });
  await salary.evaluate((element) =>
    element.scrollIntoView({ block: 'center' })
  );
  if (process.env.QUESTIONS_SALARY_SCREENSHOT) {
    await page.screenshot({
      path: process.env.QUESTIONS_SALARY_SCREENSHOT,
      scale: 'css',
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.app-shell-compact').waitFor();
  await currency.evaluate((element) =>
    element.scrollIntoView({ block: 'start' })
  );
  const size = await page.evaluate(() => ({
    width: globalThis.innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  assert(size.width === size.scroll, 'salary controls fit the mobile viewport');
  if (process.env.QUESTIONS_SALARY_MOBILE_SCREENSHOT) {
    await page.screenshot({
      path: process.env.QUESTIONS_SALARY_MOBILE_SCREENSHOT,
      scale: 'css',
    });
  }
  await page.setViewportSize({ width: 1200, height: 1100 });
  await page.locator('.app-shell-compact').waitFor({ state: 'detached' });
};

const verifySubstitution = async (saved, preview) => {
  await verifyQuestionSubstitution({
    page,
    panel,
    preview,
    editor,
    store,
    until,
  });
  await panel
    .getByRole('button', { name: saved.question, exact: true })
    .click();
};

await finish(async () => {
  await page.addInitScript(
    ({ key, version }) =>
      globalThis.localStorage.setItem(
        key,
        JSON.stringify({ off: true, v: version })
      ),
    { key: TUTORIAL_STORAGE_KEY, version: TUTORIAL_VERSION }
  );
  await showPanel();
  const saved = await saveInitialRule();
  await page.reload();
  await panel.locator(':scope > summary').click();
  await panel
    .getByRole('button', { name: 'Где вы живете?', exact: true })
    .click();
  assert(
    (await editor.getByLabel('Answer', { exact: true }).inputValue()) ===
      saved.answers[0].text,
    'saved answer survives reload'
  );
  assert(
    (await editor
      .getByLabel('Equivalent questions, one per line')
      .inputValue()) === saved.questions[0],
    'equivalent question survives reload'
  );

  const preview = panel.locator('details').filter({
    has: page.locator(':scope > summary', { hasText: 'Preview answer' }),
  });
  await panel.locator('summary').filter({ hasText: 'Preview answer' }).click();
  await preview
    .getByLabel('Question or pattern', { exact: true })
    .fill('Где вы живете?');
  await preview.getByLabel('Provider for preview', { exact: true }).fill('hh');
  await preview
    .getByRole('button', { name: 'Preview answer', exact: true })
    .click();
  await preview
    .getByText('Missing profile values: city', { exact: true })
    .waitFor();
  const profile = preview.locator('[data-answer-profile]');
  await profile
    .getByRole('textbox', { name: 'Field name, e.g. city' })
    .fill('city');
  await profile.getByRole('button', { name: 'Add field', exact: true }).click();
  await profile.getByLabel('city', { exact: true }).fill('Nha Trang');
  await preview
    .getByRole('button', { name: 'Preview answer', exact: true })
    .click();
  await preview
    .locator('[data-answer-preview]')
    .getByText('Живу в Nha Trang.', { exact: true })
    .waitFor();
  await preview.getByText('Approved and complete.', { exact: true }).waitFor();
  if (process.env.QUESTIONS_SCREENSHOT) {
    await page.setViewportSize({ width: 1200, height: 1100 });
    await preview.evaluate((element) =>
      element.scrollIntoView({ block: 'center' })
    );
    await page.screenshot({
      path: process.env.QUESTIONS_SCREENSHOT,
      scale: 'css',
    });
  }

  await verifyContexts(preview);
  await verifyLearning(saved);
  await verifyPolicy();
  await verifySalary(preview);
  await verifySubstitution(saved, preview);

  await panel
    .getByRole('button', { name: 'Create question automation', exact: true })
    .click();
  const automation = page.locator('form.automation-editor');
  await automation.waitFor();
  assert(
    (await automation.locator('[name="actionKind"]').inputValue()) ===
      'answer-questions',
    'question action selected'
  );
  assert(
    (await automation
      .locator('[data-answer-profile]')
      .last()
      .getByLabel('city', { exact: true })
      .inputValue()) === 'Nha Trang',
    'profile carried into editable action'
  );
  const actionContexts = automation.locator('[data-answer-contexts]');
  await actionContexts.locator(':scope > summary').click();
  assert(
    (await actionContexts
      .getByLabel('Context field, e.g. currency', { exact: true })
      .inputValue()) === 'location',
    'context groups carried into the editable action'
  );
  await automation.getByRole('button', { name: 'Save', exact: true }).click();
  await until(
    async () =>
      (
        await store.query(
          (link) =>
            link.id?.startsWith('automation:') &&
            link.action?.kind === 'answer-questions'
        )
      ).length === 1,
    'question automation saved'
  );
  const [persisted] = await store.query(
    (link) =>
      link.id?.startsWith('automation:') &&
      link.action?.kind === 'answer-questions'
  );
  assert(
    persisted.action.contexts[0].choices[1].profile.city === 'Da Nang',
    'context profile choices persisted through the production API'
  );
  assert(
    persisted.action.salary.approved &&
      persisted.action.salary.currencies[0].net === 6000 &&
      persisted.action.salary.currencies[0].grossMethod === 'personal' &&
      persisted.action.salary.taxes.personal.bands.length === 3 &&
      persisted.action.salary.exchange.rates[0].rate === 84.9048 &&
      persisted.action.salary.exchangeMode === 'cbr',
    'salary targets, calculation, rate snapshot and explicit approval persisted through the production API'
  );

  await page.route('**/api/automations/answers/save', (route) =>
    fulfil(route, { error: 'Answer fixture refusal', status: 'failed' }, 500)
  );
  await editor
    .getByLabel('Answer', { exact: true })
    .fill('Keep my unsaved edit');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await panel
    .getByRole('alert')
    .filter({ hasText: 'Answer fixture refusal' })
    .waitFor();
  assert(
    (await store.get(saved.id)).answers[0].text === saved.answers[0].text,
    'refused save never changes stored rule'
  );
  assert(
    (await editor.getByLabel('Answer', { exact: true }).inputValue()) ===
      'Keep my unsaved edit',
    'refused save retains the edit'
  );
  await verifyMobile();
  await verifyQuestionLanguage({ page, panel, editor, preview, store, until });
  verifySyncCapability();
});
