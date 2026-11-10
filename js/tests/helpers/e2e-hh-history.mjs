import { assert } from './e2e-chat.mjs';
import { hhHistoryFixture } from '../../../experiments/issue-56/hh-history-fixture.mjs';
import { importInto } from '../../src/sources/index.js';

export const resetHhHistoryFixture = async (store) => {
  for (const link of await store.query((link) =>
    /^(?:msg:|qa-rule:)/u.test(link.id)
  )) {
    await store.delete(link.id);
  }
  await importInto(store, 'hh', hhHistoryFixture());
};

export const verifyHhHistory = async ({
  page,
  base,
  store,
  until,
  before = false,
}) => {
  await page.goto(`${base}/?history-check=hh#/automation`);
  const panel = page.locator('[data-question-controls]');
  await panel.locator(':scope > summary').click();
  const learner = panel.locator('details').filter({
    has: page
      .locator(':scope > summary')
      .getByText('Learn from conversations', { exact: true }),
  });
  await learner.locator(':scope > summary').click();
  await learner
    .getByRole('button', { name: 'Preview learned answers', exact: true })
    .click();
  const proposal = learner.locator('li').filter({
    has: page
      .locator('strong')
      .getByText('Where do you live?', { exact: true }),
  });
  if (before) {
    await learner
      .getByText('Archived messages inspected: 0 of 1.', { exact: true })
      .waitFor();
    await page.screenshot({
      path: 'docs/screenshots/issue-56-hh-history-before.png',
    });
    assert(
      await proposal.count(),
      'provider archive retains the real applicant answer proposal'
    );
    return;
  }
  await proposal.getByText('Vietnam.', { exact: true }).waitFor();
  await proposal
    .getByText('Observed answer turns: 1', { exact: true })
    .waitFor();
  assert(
    (await store.query((link) => link.id.startsWith('qa-rule:'))).length === 0,
    'preview never approves or saves an imported answer'
  );
  await learner
    .getByText('Archived messages inspected: 4 of 4.', { exact: true })
    .waitFor();
  await learner.scrollIntoViewIfNeeded();
  if (process.env.HH_HISTORY_SCREENSHOTS === '1') {
    await page.screenshot({
      path: 'docs/screenshots/issue-56-hh-history-after.png',
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await learner.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'docs/screenshots/issue-56-hh-history-mobile.png',
    });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth === globalThis.innerWidth
      ),
      'history learning fits a phone viewport'
    );
    await page.setViewportSize({ width: 1200, height: 800 });
  }
  await learner
    .getByRole('button', { name: 'Save proposals for review', exact: true })
    .click();
  await until(
    async () =>
      (await store.query((link) => link.id.startsWith('qa-rule:'))).length ===
      1,
    'imported proposal saved for review'
  );
  const [rule] = await store.query((link) => link.id.startsWith('qa-rule:'));
  assert(
    rule.answers[0].count === 1 && !rule.answers[0].approved,
    'importing an application never authorizes automatic sending'
  );
  // Exercise the same streamed upload endpoint used by the archive screen.
  const upload = await page.request.post(
    `${base}/api/archive/upload?source=hh&name=hh-history.json`,
    {
      headers: { 'content-type': 'application/octet-stream' },
      data: JSON.stringify(hhHistoryFixture()),
    }
  );
  assert(upload.ok(), 'the real archive upload accepts the provider fixture');
  await learner
    .getByRole('button', { name: 'Preview learned answers', exact: true })
    .click();
  await proposal
    .getByText('Observed answer turns: 1', { exact: true })
    .waitFor();
};
