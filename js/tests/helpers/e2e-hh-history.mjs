import { assert } from './e2e-chat.mjs';
import { hhHistoryFixture } from '../../../experiments/issue-56/hh-history-fixture.mjs';
import {
  hhRecordingAnswer,
  hhRecordingChat,
  hhRecordingFixture,
} from '../../../experiments/issue-56/hh-recording-fixture.mjs';
import { importInto } from '../../src/sources/index.js';
import { openQuestionDisclosure } from './question-preview.mjs';

const seedHhHistory = (store) => importInto(store, 'hh', hhHistoryFixture());

export const resetHhHistoryFixture = async (store, seed = seedHhHistory) => {
  for (const link of await store.query((link) =>
    /^(?:msg:|qa-rule:|message-version:)/u.test(link.id)
  )) {
    await store.delete(link.id);
  }
  await seed(store);
};

const previewHhArchive = async (page, base, fixture) => {
  await page.goto(`${base}/?history-check=${fixture}#/automation`);
  const panel = page.locator('[data-question-controls]');
  await openQuestionDisclosure(panel);
  const learner = panel.locator('details').filter({
    has: page
      .locator(':scope > summary')
      .getByText('Learn from conversations', { exact: true }),
  });
  await openQuestionDisclosure(learner);
  await learner
    .getByRole('button', { name: 'Preview learned answers', exact: true })
    .click();
  return learner;
};

export const verifyHhHistory = async ({
  page,
  base,
  store,
  until,
  before = false,
}) => {
  const learner = await previewHhArchive(page, base, 'hh');
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

export const verifyHhAnswerRevisions = async ({
  page,
  base,
  store,
  screenshot,
}) => {
  const learner = await previewHhArchive(page, base, 'hh-revisions');
  const proposal = learner
    .locator('li')
    .filter({ hasText: 'Where do you live?' });
  await proposal.getByText('Thailand.', { exact: true }).waitFor();
  assert(
    (await store.query((link) => link.id.startsWith('qa-rule:'))).length === 0,
    'the archive preview leaves the knowledge store untouched'
  );
  if (screenshot) {
    await proposal.evaluate((element) =>
      element.scrollIntoView({ block: 'center' })
    );
    await page.screenshot({ path: screenshot });
  }
  assert(
    (await proposal.getByText('Vietnam.', { exact: true }).count()) === 1,
    'the earlier observed wording appears once beside the current wording'
  );
  assert(
    (await proposal
      .getByText('Observed answer turns: 1', { exact: true })
      .count()) === 2,
    'the original and edited wordings count once each'
  );
  await learner
    .getByText('Incomplete edit history for 1 sent message.', { exact: false })
    .waitFor();
};

export const verifyHhRecording = async ({
  page,
  base,
  store,
  before = false,
}) => {
  await page.goto(base);
  await page.locator('button[data-view="connections"]').click();
  await page
    .locator(
      'article[data-provider-id="hh"] [data-action="open-connection-detail"]'
    )
    .click();
  const connection = page.locator('#conn-hh');
  const manual = connection.locator('[data-action="connection-mode-manual"]');
  if (await manual.count()) {
    await manual.click();
  }
  const uploaded = before
    ? null
    : page.waitForResponse((response) =>
        response.url().includes('/api/archive/upload?source=hh')
      );
  await connection.locator('input[data-action="archive-file"]').setInputFiles({
    name: 'chat-history.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(hhRecordingFixture())),
  });
  if (uploaded) {
    assert(
      (await uploaded).ok(),
      'archive upload succeeded without a provider session'
    );
  }
  const screenshots = process.env.HH_RECORDING_SCREENSHOTS === '1';
  const status = connection.locator(
    '.provider-archive-import .row > span.meta'
  );
  await status.filter({ hasText: /imported|import failed/i }).waitFor();
  const result = await status.textContent();
  console.log('[hh-recording-import]', result);
  if (before && screenshots) {
    await status.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'docs/screenshots/issue-56-hh-recording-before.png',
    });
  }
  assert(
    result.includes(': 2 messages imported'),
    `the recorder archive import reports two native messages. Received ${result}`
  );
  const paste = connection.locator('[data-action="archive-paste"]');
  const importPasted = connection.locator('[data-action="archive-import"]');
  await paste.fill(JSON.stringify(hhRecordingFixture()));
  await importPasted.click();
  await status
    .filter({ hasText: 'chat-history.json: 0 messages imported' })
    .waitFor();
  await page.locator('button[data-view="chat"]').click();
  await page.locator(`[data-chat="hh:web:${hhRecordingChat}"]`).click();
  const answer = page.locator(`[data-row="${hhRecordingAnswer}"]`);
  await answer.getByText('Python and JavaScript', { exact: true }).waitFor();
  await answer
    .locator('[data-delivery="unknown"][aria-label="Delivery unconfirmed"]')
    .waitFor();
  await page.locator('[data-hh-recording-only]').waitFor();
  assert(
    !(await page.locator('.chat-day[data-day]').count()),
    'no invented day'
  );
  assert(
    !(await page.locator('.chat-composer textarea').count()),
    'no composer'
  );
  if (screenshots) {
    await page.screenshot({
      path: 'docs/screenshots/issue-56-hh-recording-chat.png',
    });
  }
  await page.locator('[data-action="edited-open"]').click();
  await page.locator('[data-edited-id]').first().click();
  const dialog = page.locator('[data-dialog="message-versions"]');
  for (const wording of ['Python and JavaScript', 'Python 3', 'Python']) {
    await dialog.getByText(wording, { exact: true }).waitFor();
  }
  await dialog.getByText('Some earlier versions may be unavailable.').waitFor();
  assert(
    (await dialog.locator('[data-version]').count()) === 3,
    'earlier wordings only appear in the version history'
  );
  if (screenshots) {
    await page.screenshot({
      path: 'docs/screenshots/issue-56-hh-recording-after.png',
    });
  }
  await page.goto(`${base}/#/operator`);
  await page.locator('.operator-empty').waitFor();
  assert(
    !(await page.locator('[data-operator-chat]').count()),
    'archive import does not invent unread work in Operator'
  );
  const learner = await previewHhArchive(page, base, 'hh-recording');
  await learner
    .getByText('Archived messages inspected: 0 of 2.', { exact: true })
    .waitFor();
  await learner
    .getByText(/lack reliable timestamps and were excluded/u)
    .waitFor();
  assert(
    !(await store.query((link) => link.id.startsWith('qa-rule:'))).length,
    'the offline recording does not create learned rules'
  );
  await page.goto(`${base}/#conn-hh/manual`);
  await paste.fill(JSON.stringify(hhHistoryFixture()));
  await importPasted.click();
  await status
    .filter({ hasText: 'Imported 4 messages from pasted snippet.' })
    .waitFor();
};
