import { listAnswerRules } from '../../src/automation/question-store.js';
import { responseFor, decoded } from './e2e-form-review.mjs';
import { assert } from './e2e-chat.mjs';

const captureMobile = async (page) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .locator('[data-form-reviews] > h2')
    .evaluate((heading) => heading.scrollIntoView({ block: 'center' }));
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ),
    'capture controls fit phone width'
  );
  assert(
    (await page.locator('[data-tutorial-overlay]').count()) === 0,
    'tutorial is off for verification'
  );
  if (process.env.FORMS_MONITOR_SCREENSHOTS === '1') {
    await page.screenshot({
      path: 'docs/screenshots/issue-56-forms-monitor-mobile.png',
    });
  }
};

export const verifyFormMonitorUi = async ({
  page,
  owned,
  fixture,
  until,
  store,
}) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  const before = process.env.FORMS_MONITOR_BEFORE === '1';
  const rules = JSON.stringify(await listAnswerRules(store));
  if (!before) {
    await page.locator('[data-form-auto-capture]').check();
  }
  await page
    .locator('[data-form-url]')
    .fill(fixture.url.replace('/application', '/monitor'));
  let pending = responseFor(page, 'open');
  await page.locator('[data-action="open-form-review"]').click();
  const opened = await decoded(await pending);
  if (!before) {
    assert(
      opened.session.monitoring.state === 'active',
      'capture is active by default'
    );
    assert(
      opened.session.monitoring.learning === false,
      'no learning is claimed'
    );
  }
  const owner = owned.at(-1);
  pending = responseFor(page, 'read');
  await page.locator('[data-review-action="read"]').click();
  const report = await decoded(await pending);
  if (!before) {
    assert(report.navigation?.nextPage, 'Vietnamese Next control is observed');
    await page.locator('[data-form-next-page]').waitFor();
  }
  // Set the value and navigate in the same JavaScript turn, before debounce.
  await owner.page.evaluate(() => {
    const answer = document.querySelector('[name="monitorAnswer"]');
    answer.value = 'Owner answer before rapid Next';
    answer.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    document.querySelector('#next').click();
  });
  await owner.page.waitForURL('**/monitor?page=2');
  await owner.page
    .locator('[name="monitorAnswer"]')
    .fill('Owner answer on page two');
  let history;
  const readHistory = async () => {
    const reply = responseFor(page, 'history');
    await page.locator('[data-review-action="history"]').click();
    history = await decoded(await reply);
    return history.checkpoints.some((entry) =>
      entry.report.fields.some(
        (field) => field.value === 'Owner answer on page two'
      )
    );
  };
  if (before) {
    await readHistory();
    await page
      .locator('[data-form-journal] > h2')
      .evaluate((heading) => heading.scrollIntoView({ block: 'center' }));
    await page.screenshot({
      path: 'docs/screenshots/issue-56-forms-monitor-before.png',
    });
  } else {
    await until(readHistory, 'automatic owner edit on page two');
  }
  const first = history.checkpoints.find(
    (entry) =>
      entry.action === 'observe' &&
      entry.report.fields.some(
        (field) => field.value === 'Owner answer before rapid Next'
      )
  );
  assert(first, 'rapid Next retains the previous page owner answer');
  assert(
    history.checkpoints.some((entry) =>
      entry.report.fields.some(
        (field) => field.value === 'Owner answer on page two'
      )
    ),
    'later pages captured without an explicit read'
  );
  assert(
    history.checkpoints.some((entry) =>
      entry.report.fields.some(
        (field) => field.value === 'Visible embedded answer'
      )
    ),
    'visible cross-origin frame captured'
  );
  const serialized = JSON.stringify(history);
  for (const secret of [
    'hidden-frame-canary',
    'hidden-control-canary',
    'monitor-password-canary',
  ]) {
    assert(
      !serialized.includes(secret),
      'hidden and password values stay unread'
    );
  }
  assert(
    history.monitoring.omitted === 0 && history.monitoring.failed === 0,
    'capture has no silent failures'
  );
  assert(
    JSON.stringify(await listAnswerRules(store)) === rules,
    'unsent navigation never learns answers'
  );
  assert(fixture.submits === 0, 'monitor never submits the form');
  await page.locator(`[data-form-checkpoint="${first.sequence}"]`).click();
  await page
    .getByText('Current value: Owner answer before rapid Next', { exact: true })
    .waitFor();
  await page.locator('[data-form-next-page]').waitFor();
  assert(
    (await page.locator('[data-action="apply-form-plan"]').count()) === 0,
    'automatic history has no live write authority'
  );
  if (process.env.FORMS_MONITOR_SCREENSHOTS === '1') {
    await page
      .locator('[data-form-journal] > h2')
      .evaluate((heading) => heading.scrollIntoView({ block: 'center' }));
    await page.screenshot({
      path: 'docs/screenshots/issue-56-forms-monitor-after.png',
    });
  }
  await captureMobile(page);
  pending = responseFor(page, 'close');
  await page.locator('[data-review-action="close"]').click();
  await decoded(await pending);
  assert(
    owner.closed && fixture.submits === 0,
    'capture drains before owned browser close'
  );
};
