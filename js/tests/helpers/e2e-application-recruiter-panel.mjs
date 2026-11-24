import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { listAnswerRules } from '../../src/automation/question-store.js';
import {
  applicationRecruiterPanelFixture,
  recruiterPanelDraft,
  recruiterPanelQuestion,
  recruiterPanelReply,
} from '../../../experiments/issue-56/application-recruiter-panel-fixture.mjs';
import { originalApplicationSearch } from '../../../experiments/issue-56/application-search-route-fixture.mjs';
import { applicationPanelBrowser } from './application-panel-browser.mjs';
import { nativeApplicationForm } from './application-native-request.mjs';
import { openQuestionDisclosure } from './question-preview.mjs';

const vacancy = 'https://hh.ru/vacancy/123';
const recruiterLink = '[data-qa="chatik-header-sub-header"] a';

const waitForCapture = async (read, description) => {
  for (const deadline = Date.now() + 6000; Date.now() < deadline;) {
    const value = await read();
    if (value) {
      return value;
    }
    await setTimeout(200);
  }
  assert.fail(description);
};

const verifyRecruiterReplyLearning = async ({
  page,
  draft,
  frame,
  nativePanel,
  fixture,
  shot,
  verifyPending,
}) => {
  const replyId = 'msg:hh:web:456:2';
  const draftRule = async () =>
    (await listAnswerRules(fixture.runtimeStore)).find(
      (rule) => rule.question === recruiterPanelQuestion
    );
  assert.equal(await draftRule(), undefined);
  await draft.fill(recruiterPanelReply);
  await frame.getByRole('button', { name: 'Send reply' }).click();
  if (verifyPending) {
    await waitForCapture(
      async () =>
        (await fixture.runtimeStore.get(replyId))?.delivery === 'pending',
      'the pending native reply must be archived'
    );
    assert.equal(await draftRule(), undefined);
  }
  const providerDelivery = frame.locator('[data-qa="status-icon-pending"]');
  await providerDelivery.evaluate((node) => {
    node.dataset.qa = 'status-icon-delivered';
    node.textContent = 'Delivered';
  });
  await frame.getByText('Delivered', { exact: true }).waitFor();
  await shot('owner-reply-native', nativePanel);
  await page.goto(`${fixture.base}/#/automation`);
  const questions = page.locator('[data-question-controls]');
  await openQuestionDisclosure(questions);
  const ruleButton = questions.getByRole('button', {
    name: recruiterPanelQuestion,
    exact: true,
  });
  try {
    await waitForCapture(
      draftRule,
      'the confirmed native reply must produce a proposal'
    );
    await questions
      .getByRole('button', { name: 'Refresh answers', exact: true })
      .click();
    await ruleButton.waitFor();
  } catch (error) {
    await shot('owner-reply-before', questions);
    throw error;
  }
  const rule = await draftRule();
  const reply = await fixture.runtimeStore.get(replyId);
  assert.equal(reply.body, recruiterPanelReply);
  assert.equal(reply.delivery, 'delivered');
  assert.equal(reply.hhBrowserVacancyId, '123');
  assert.equal(await providerDelivery.count(), 0);
  assert.equal(
    await frame
      .locator('body')
      .evaluate(() => globalThis.fixtureRecruiterSends),
    1
  );
  assert.deepEqual(rule.answers[0], {
    text: recruiterPanelReply,
    approved: false,
    canonical: false,
    count: 1,
    evidence: [replyId],
  });
  await ruleButton.click();
  await questions.locator('[data-answer-rule]').waitFor();
  await shot('owner-reply-learned', questions.locator('[data-answer-rule]'));
  await draft.fill(recruiterPanelDraft);
  await page.goto(`${fixture.base}/#/cv`);
};

const verifyRecruiterPanelBinding = async ({
  panel,
  owned,
  frame,
  draft,
  status,
  receipt,
  fixture,
  shot,
  checkArchive,
}) => {
  const unverified = panel.locator(
    '[data-application-recruiter-chat="unverified"]'
  );
  const setLink = (url) =>
    frame.locator(recruiterLink).evaluate((node, value) => {
      node.setAttribute('href', value);
    }, url);
  await owned.evaluate(() => {
    const decoy = document.createElement('iframe');
    decoy.id = 'fixture-decoy';
    decoy.src = document.querySelector('[data-qa="chatik-root"] iframe').src;
    document.body.append(decoy);
  });
  const decoy = owned.locator('#fixture-decoy');
  const decoyLink = decoy.contentFrame().locator(recruiterLink);
  await decoyLink.waitFor();
  await setLink('https://hh.ru/vacancy/789');
  const body = frame.locator('[data-qa="chat-bubble-text"]').first();
  const setBody = (text) =>
    body.evaluate((node, value) => {
      node.textContent = value;
    }, text);
  if (checkArchive) {
    await setBody('Could you share your details for another vacancy?');
  }
  try {
    await unverified.waitFor();
  } catch (error) {
    if (await status.isVisible()) {
      await shot('wrong-vacancy-before', status.locator('..'));
    }
    throw error;
  }
  await receipt.waitFor();
  assert.equal(await draft.inputValue(), recruiterPanelDraft);
  assert.equal(fixture.effects.length, 0);
  await shot('wrong-vacancy', unverified.locator('..'));
  if (checkArchive) {
    const saved = await fixture.runtimeStore.get('msg:hh:web:456:1');
    assert.equal(saved?.body, recruiterPanelQuestion);
    await setBody(recruiterPanelQuestion);
  }
  await setLink(vacancy);
  await status.waitFor();

  // A second visible chat is ambiguous before its header loads, too.
  await decoy.evaluate((node) => {
    document.querySelector('[data-qa="chatik-root"]').append(node);
  });
  await decoyLink.waitFor();
  await decoyLink.evaluate((node) => node.remove());
  await unverified.waitFor();
  assert.equal(await draft.inputValue(), recruiterPanelDraft);
  await decoy.evaluate((node) => {
    node.hidden = true;
  });
  await status.waitFor();
};

export const verifyNativeApplicationRecruiterPanel = async (
  browser,
  {
    before = false,
    screenshots,
    webBundle,
    panelDelayMs = 4000,
    manualSend = false,
    verifyBinding = true,
    ownerReply = false,
    verifyPending = true,
  } = {}
) => {
  const fixture = await applicationRecruiterPanelFixture(browser, {
    panelDelayMs,
    ownerReply,
  });
  const controls = applicationPanelBrowser(fixture);
  const { page, panel } = controls;
  const { batch, button, field, phase } = controls.batch();
  const shot = controls.screenshot(screenshots, 'application-recruiter-panel');
  if (webBundle) {
    await page.route(`${fixture.base}/app.min.js`, (route) =>
      route.fulfill({ path: webBundle, contentType: 'text/javascript' })
    );
  }
  try {
    await controls.select();
    await panel
      .locator('[data-application-option="applyFromVacancyPage"]')
      .uncheck();
    await panel
      .locator('[data-application-option="applicationSearchUrl"]')
      .fill(originalApplicationSearch);
    await panel
      .locator('[data-application-option="vacancyPreviewSeconds"]')
      .fill('0');
    await field('urls').fill(vacancy);
    await field('maxApplications').fill('1');
    await field('confirmBatch').check();
    await button('start').click();
    await phase('review');
    await button('follow').click();
    await panel.locator('[data-application-state="review"]').waitFor();
    const owned = nativeApplicationForm(browser);
    assert(owned);
    if (manualSend) {
      await owned.getByRole('button', { name: 'Send application' }).click();
    } else {
      await controls.confirmed('submit');
    }
    if (before) {
      await phase('completed');
      await shot('before', batch);
      assert.equal(
        owned.isClosed(),
        false,
        'The batch closed the returned search before the recruiter panel could be reviewed'
      );
    }
    const status = panel.locator('[data-application-recruiter-chat="open"]');
    const receipt = panel.locator(
      '[data-application-delivery="provider-confirmed"]'
    );
    const nativePanel = owned.locator('[data-qa="chatik-root"]');
    const frame = nativePanel
      .locator('iframe[title="Recruiter chat"]')
      .contentFrame();
    const draft = frame.getByRole('textbox', { name: 'Your reply' });
    await draft.waitFor();
    await status.waitFor();
    await receipt.waitFor();
    await phase('review');
    assert.equal(owned.url(), originalApplicationSearch);
    assert.deepEqual(fixture.searchVisits, [
      originalApplicationSearch,
      originalApplicationSearch,
    ]);
    assert.equal(
      await owned.evaluate(() =>
        globalThis.sessionStorage.getItem('fixture-application-sends')
      ),
      '1'
    );
    assert.equal(await draft.inputValue(), recruiterPanelDraft);
    assert.equal(fixture.effects.length, 0);
    await shot('desktop', status.locator('..'));
    await shot('native', nativePanel);
    if (verifyBinding) {
      await verifyRecruiterPanelBinding({
        panel,
        owned,
        frame,
        draft,
        status,
        receipt,
        fixture,
        shot,
        checkArchive: ownerReply,
      });
    }
    if (ownerReply) {
      await verifyRecruiterReplyLearning({
        page,
        draft,
        frame,
        nativePanel,
        fixture,
        shot,
        verifyPending,
      });
    }
    await controls.phone();
    await page.reload();
    await phase('review');
    await button('follow').click();
    await status.waitFor();
    await receipt.waitFor();
    assert.equal(await draft.inputValue(), recruiterPanelDraft);
    await shot('phone', status.locator('..'));
    await nativePanel
      .getByRole('button', { name: 'Close recruiter panel' })
      .click();
    await phase('completed');
    assert.equal(owned.isClosed(), true);
    assert.equal(fixture.effects.length, 1);
    assert.equal(fixture.searchVisits.length, 2);
    assert(fixture.records.every((record) => record.closed));
    assert.deepEqual(fixture.errors, []);
    return {
      applicationsSent: 1,
      manualSend,
      exactSearchVisits: 2,
      draftPreserved: true,
      batchCompletedAfterOwnerDismissal: true,
      resourcesClosed: true,
    };
  } finally {
    await fixture.close();
  }
};
