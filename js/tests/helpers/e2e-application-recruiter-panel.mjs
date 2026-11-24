import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import {
  listAnswerRules,
  previewAnswer,
} from '../../src/automation/question-store.js';
import {
  applicationRecruiterPanelFixture,
  recruiterPanelChoices,
  recruiterPanelDraft,
  recruiterPanelQuestion,
  recruiterPanelReply,
  recruiterPanelSavedDraft,
  recruiterReuseOptions,
  recruiterReuseQuestion,
} from '../../../experiments/issue-56/application-recruiter-panel-fixture.mjs';
import { outboxId } from '../../src/automation/outbox.js';
import { questionChoiceKey } from '../../src/automation/question-choice-key.js';
import { saveSettings } from '../../src/automation/safety.js';
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

const verifyApproximateAnswer = async (store) => {
  const plan = await previewAnswer(store, { question: recruiterPanelQuestion });
  assert.equal(plan.match, 'approximate');
  assert.equal(plan.requiresReview, true);
  assert.equal(plan.text, recruiterPanelSavedDraft);
};

const verifyRecruiterDraftReview = async ({
  draft,
  frame,
  nativePanel,
  panel,
  status,
  shot,
}) => {
  const link = frame.locator(recruiterLink);
  const messages = frame.locator('#recruiter-messages');
  const draftWrites = () =>
    draft.evaluate(() => globalThis.fixtureRecruiterDraftWrites);
  const setVacancy = (url) =>
    link.evaluate((node, value) => node.setAttribute('href', value), url);

  assert.equal(await draft.inputValue(), recruiterPanelDraft);
  assert.equal(await draftWrites(), 0);
  await setVacancy('https://hh.ru/vacancy/789');
  await panel
    .locator('[data-application-recruiter-chat="unverified"]')
    .waitFor();
  await draft.fill('');
  await setTimeout(900);
  assert.equal(await draft.inputValue(), '');
  assert.equal(await draftWrites(), 0);
  await setVacancy(vacancy);
  await status.waitFor();
  try {
    await waitForCapture(
      async () => (await draft.inputValue()) === recruiterPanelSavedDraft,
      'the verified recruiter panel must prefill the approximate answer'
    );
  } catch (error) {
    await shot('draft-before', nativePanel);
    throw error;
  }
  assert.ok(await messages.evaluate((node) => node.scrollTop > 0));
  assert.equal(await draftWrites(), 1);
  assert.equal(await draft.evaluate(() => globalThis.fixtureRecruiterSends), 0);
  await shot('draft-prefilled', nativePanel);
  await draft.fill('');
  await setTimeout(900);
  assert.equal(await draft.inputValue(), '');
  assert.equal(await draftWrites(), 1);
  await draft.fill(recruiterPanelDraft);
};

const verifyExactRecruiterReplies = async ({
  draft,
  frame,
  nativePanel,
  panel,
  fixture,
  shot,
}) => {
  const reply = panel.locator(
    '[data-application-recruiter-reply="provider-confirmed"]'
  );
  const body = frame.locator('body');
  const sends = () => body.evaluate(() => globalThis.fixtureRecruiterSends);
  const outbox = (question) =>
    fixture.runtimeStore.get(
      outboxId(
        questionChoiceKey({
          source: 'hh',
          chat: '456',
          answer: { message: `msg:hh:456:${question}`, textReply: true },
        })
      )
    );
  const confirm = async (question, id, text) => {
    await waitForCapture(async () => {
      const row = await outbox(question);
      return (
        row?.status === 'sent' &&
        row.receipt?.messageId === String(id) &&
        (row.receipt.text ?? row.receipt.option) === text
      );
    }, `native recruiter reply ${id} needs a positive outbox receipt`);
  };
  assert.equal(await sends(), 0);
  await draft.fill('');
  try {
    await confirm(1, 2, recruiterPanelSavedDraft);
  } catch (error) {
    await shot('exact-before', nativePanel);
    throw error;
  }
  await reply.waitFor();
  assert.equal(await sends(), 1);
  assert.equal(await draft.inputValue(), '');
  await shot('exact-text', nativePanel);
  await shot('exact-receipt', reply.locator('..'));

  const showChoices = (exact) =>
    body.evaluate(
      (_node, value) => globalThis.fixtureRecruiterChoices(value),
      exact
    );
  await showChoices(false);
  await frame
    .getByRole('button', { name: `${recruiterPanelChoices[0]}.`, exact: true })
    .waitFor();
  await setTimeout(1300);
  assert.equal(await sends(), 1);
  assert.equal(await outbox(3), null);
  await saveSettings(fixture.runtimeStore, {
    quietHours: { enabled: false },
    optOut: [{ source: 'hh', chat: 'web:456' }],
  });
  await showChoices(true);
  await frame
    .getByRole('button', { name: recruiterPanelChoices[0], exact: true })
    .waitFor();
  await setTimeout(1300);
  assert.equal(await sends(), 1);
  assert.equal(await outbox(3), null);
  await saveSettings(fixture.runtimeStore, { quietHours: { enabled: false } });
  await confirm(3, 4, recruiterPanelChoices[0]);
  assert.equal(await sends(), 2);
  await shot('exact-choice', nativePanel);
  // Restore the owner draft to exercise recovery without another dispatch.
  await frame
    .locator('textarea[data-qa="text-input"]')
    .evaluate((node, text) => {
      node.closest('label').hidden = false;
      node.value = text;
    }, recruiterPanelDraft);
};

const verifyRecruiterReuse = async ({
  frame,
  nativePanel,
  panel,
  fixture,
  shot,
}) => {
  await nativePanel.locator('iframe').evaluate((node) => {
    node.style.height = '320px';
  });
  const body = frame.locator('body');
  const composer = frame.locator('textarea[data-qa="text-input"]');
  const sends = () => body.evaluate(() => globalThis.fixtureRecruiterSends);
  const offer = (id, summary) =>
    body.evaluate((_node, args) => globalThis.fixtureRecruiterReuse(args), {
      id,
      summary: `Похоже, вы отвечали на часть вопросов:\n${summary}`,
    });
  const outbox = (id) =>
    fixture.runtimeStore.get(
      outboxId(
        questionChoiceKey({
          source: 'hh',
          chat: '456',
          answer: { message: `msg:hh:456:${id}`, strictOptions: true },
        })
      )
    );
  const confirm = (id, option) =>
    waitForCapture(async () => {
      const row = await outbox(id);
      return (
        row?.status === 'sent' &&
        row.receipt?.messageId === String(id + 1) &&
        row.receipt.option === option
      );
    }, `HeadHunter reuse offer ${id} needs a native choice receipt`);

  await offer(3, `${recruiterReuseQuestion}: Yes!`);
  await frame
    .getByRole('button', { name: recruiterReuseOptions[0], exact: true })
    .waitFor();
  await setTimeout(1300);
  assert.equal(
    await composer.evaluate((node) => node.value),
    recruiterPanelDraft
  );
  assert.equal(await sends(), 0);
  await composer.evaluate((node) => {
    node.value = '';
  });
  try {
    await confirm(3, recruiterReuseOptions[0]);
  } catch (error) {
    await shot('reuse-before', nativePanel);
    throw error;
  }
  await shot('reuse-positive', nativePanel);

  await offer(6, 'Насколько хорошо вы знаете Rust?: Хорошо.');
  await setTimeout(1300);
  assert.equal(await sends(), 1);
  assert.equal(await outbox(6), null);
  await frame
    .getByRole('button', { name: recruiterReuseOptions[1], exact: true })
    .evaluate((node) => node.scrollIntoView({ block: 'end' }));
  await shot('reuse-owner-choice', nativePanel);
  await offer(
    6,
    `${recruiterReuseQuestion}: Нет.\nНасколько хорошо вы знаете Rust?: Хорошо.`
  );
  await confirm(6, recruiterReuseOptions[1]);
  assert.equal(await sends(), 2);
  await frame
    .getByText('Delivered', { exact: true })
    .last()
    .evaluate((node) => node.scrollIntoView({ block: 'end' }));
  await shot('reuse-negative', nativePanel);
  await shot(
    'reuse-receipt',
    panel
      .locator('[data-application-recruiter-reply="provider-confirmed"]')
      .locator('..')
  );
  await composer.evaluate((node, draft) => {
    node.closest('label').hidden = false;
    node.value = draft;
  }, recruiterPanelDraft);
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

const verifyRecruiterPanelRecovery = async ({
  controls,
  page,
  phase,
  button,
  status,
  receipt,
  owned,
  draft,
  fixture,
  shot,
  dismiss,
}) => {
  await controls.phone();
  await page.reload();
  await phase('review');
  await button('follow').click();
  await status.waitFor();
  await receipt.waitFor();
  assert.equal(await draft.inputValue(), recruiterPanelDraft);
  await shot('phone', status.locator('..'));
  await dismiss();
  await phase('completed');
  assert.equal(owned.isClosed(), true);
  assert.equal(fixture.effects.length, 1);
  assert.equal(fixture.searchVisits.length, 2);
  assert(fixture.records.every((record) => record.closed));
  assert.deepEqual(fixture.errors, []);
};

const verifyRecruiterTerminal = async ({
  owned,
  frame,
  nativePanel,
  draft,
  shot,
}) => {
  const marker = 'fixture recruiter panel dismissed';
  let dismissals = 0;
  owned.on('console', (message) => {
    if (message.text() === marker) {
      dismissals++;
    }
  });
  const setNotice = (text) =>
    frame.locator('body').evaluate((node, value) => {
      const row =
        node.querySelector('[data-qa="chatik-chat-message-5"]') ??
        document.createElement('article');
      row.dataset.qa = 'chatik-chat-message-5';
      row.dataset.time = '2026-11-24T09:04:00Z';
      row.innerHTML = '<p data-qa="chat-bubble-text"></p>';
      row.firstElementChild.textContent = value;
      node.append(row);
    }, text);
  const expectHeld = async () => {
    await setTimeout(1300);
    assert.equal(dismissals, 0);
    assert.equal(await nativePanel.isVisible(), true);
  };
  const forwarded = 'Ваши ответы отправлены работодателю.';
  await setNotice(forwarded);
  await expectHeld();
  assert.equal(await draft.inputValue(), recruiterPanelDraft);
  await shot('terminal-draft', nativePanel);
  await setNotice(`${forwarded} Please complete the form.`);
  await draft.fill('');
  await expectHeld();
  const close = nativePanel.locator('[data-qa="chatik-close"]');
  await close.evaluate((node) => {
    const decoy = node.cloneNode();
    decoy.removeAttribute('onclick');
    decoy.dataset.qa = 'chatik-secondary-close';
    decoy.textContent = 'Close other';
    node.after(decoy);
  });
  await setNotice(forwarded);
  await expectHeld();
  const decoy = nativePanel.locator('[data-qa="chatik-secondary-close"]');
  await decoy.evaluate((node) => node.remove());
  try {
    await waitForCapture(
      () => dismissals === 1,
      'one native dismissal of the finished recruiter panel is required'
    );
  } catch (error) {
    await shot('terminal-before', nativePanel);
    throw error;
  }
  assert.equal(dismissals, 1);
};

const verifyRecruiterQuiet = async ({
  draft,
  fixture,
  frame,
  nativePanel,
  owned,
  quietRecruiter,
  shot,
}) => {
  const first = quietRecruiter === 'first';
  const current = () => fixture.observations.length;
  const hold = async ({ elapsed = 0 } = {}) => {
    const reads = current();
    fixture.advanceClock(elapsed);
    await waitForCapture(
      () => current() >= reads + 2,
      'the batch must keep observing the protected recruiter panel'
    );
    assert.equal(await nativePanel.isVisible(), true);
  };
  const setLoading = (loading) =>
    frame.locator('body').evaluate((body, value) => {
      body.setAttribute('aria-busy', String(value));
    }, loading);
  if (first) {
    await hold({ elapsed: 19_999 });
    await setLoading(true);
    await hold({ elapsed: 60_000 });
    await setLoading(false);
    await hold();
    await hold({ elapsed: 19_999 });
  } else {
    await hold({ elapsed: 60_000 });
    const send = frame.getByRole('button', { name: 'Send reply' });
    const compose = async (text) => {
      await draft.fill(text);
      await send.click();
    };
    const confirm = (id) =>
      frame
        .locator(
          `[data-qa="chatik-chat-message-${id}"] [data-qa="status-icon-pending"]`
        )
        .evaluate((node) => {
          node.dataset.qa = 'status-icon-delivered';
          node.textContent = 'Delivered';
        });
    await compose(recruiterPanelReply);
    await hold({ elapsed: 60_000 });
    await confirm(2);
    await hold();
    await hold({ elapsed: 14_999 });
    await draft.evaluate((composer) => {
      const row = document.createElement('article');
      row.dataset.qa = 'chatik-chat-message-3';
      row.dataset.time = '2026-11-24T09:02:00Z';
      row.innerHTML =
        '<p data-qa="chat-bubble-text">Could you work remotely?</p>';
      composer.closest('label').before(row);
    });
    await hold({ elapsed: 60_000 });
    await compose('Yes, I can work remotely.');
    await confirm(4);
    await draft.fill(recruiterPanelDraft);
    await hold({ elapsed: 60_000 });
    await draft.fill('');
    await hold();
    await hold({ elapsed: 14_999 });
  }
  let closes = 0;
  owned.on('console', (message) => {
    closes += Number(message.text() === 'fixture recruiter panel dismissed');
  });
  fixture.advanceClock(1);
  try {
    await waitForCapture(
      () => closes === 1,
      `the ${first ? 'first' : 'next'} recruiter wait must end in one native close`
    );
  } catch (error) {
    await shot(`quiet-${quietRecruiter}-before`, nativePanel);
    throw error;
  }
};

const verifyRecruiterSkip = async ({
  panel,
  owned,
  draft,
  nativePanel,
  web,
  shot,
}) => {
  const skip = panel.locator('[data-application-action="skip-recruiter"]');
  const sends = () => draft.evaluate(() => globalThis.fixtureRecruiterSends);
  const priorSends = await sends();
  assert.equal(typeof priorSends, 'number');
  assert.equal(await skip.count(), 0);
  assert.equal(await draft.inputValue(), recruiterPanelDraft);
  await draft.fill('');
  try {
    await waitForCapture(
      async () => (await skip.count()) && (await skip.isEnabled()),
      'Skip must be offered for the current recruiter question'
    );
  } catch (error) {
    await shot(
      'skip-before',
      panel.locator('[data-application-recruiter-chat="open"]').locator('..')
    );
    throw error;
  }
  await shot('skip-ready', skip.locator('..'));

  const close = nativePanel.locator('[data-qa="chatik-close"]');
  const recover = panel.locator('[data-application-action="recover"]');
  const clickSkip = () =>
    waitForCapture(async () => {
      if (!(await skip.isEnabled())) {
        await recover.click();
      }
      const attempted = web.waitForResponse(
        (response) =>
          new URL(response.url()).pathname ===
          '/api/vacancies/application-advance'
      );
      await skip.click();
      const response = await attempted;
      const body = await response.text();
      return !body.includes('jobs-busy') && { ok: response.ok(), body };
    }, 'Skip must acquire the vacancy writer between batch observations');
  await close.evaluate((node) => {
    const decoy = node.cloneNode();
    decoy.removeAttribute('onclick');
    decoy.dataset.qa = 'chatik-secondary-close';
    node.after(decoy);
  });
  const rejection = await clickSkip();
  assert.equal(rejection.ok, false);
  assert.match(rejection.body, /jobs-application-changed/u);
  assert.equal(await sends(), priorSends);
  assert.equal(await nativePanel.isVisible(), true);
  await nativePanel
    .locator('[data-qa="chatik-secondary-close"]')
    .evaluate((node) => node.remove());
  let closes = 0;
  owned.on('console', (message) => {
    closes += Number(message.text() === 'fixture recruiter panel dismissed');
  });
  const response = await clickSkip();
  assert.equal(response.ok, true, response.body);
  await waitForCapture(
    () => closes === 1,
    'Skip must close the single owned native panel'
  );
  assert.equal(closes, 1);
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
    prepareReply = false,
    exactReply = false,
    reuseReply = false,
    terminal = false,
    skipRecruiter = false,
    quietRecruiter,
    verifyPending = true,
  } = {}
) => {
  const fixture = await applicationRecruiterPanelFixture(browser, {
    panelDelayMs,
    ownerReply,
    prepareReply,
    exactReply,
    reuseReply,
    skipRecruiter,
    quietRecruiter,
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
    if (prepareReply) {
      await verifyApproximateAnswer(fixture.runtimeStore);
    }
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
    const automaticReply = panel.locator(
      '[data-application-option="autoSendExactAnswers"]'
    );
    if (exactReply && (await automaticReply.count())) {
      assert.equal(await automaticReply.isChecked(), false);
      await automaticReply.check();
    }
    const automaticReuse = panel.locator(
      '[data-application-option="autoReuseAnswers"]'
    );
    if (reuseReply && (await automaticReuse.count())) {
      assert.equal(await automaticReuse.isChecked(), false);
      assert.equal(await automaticReply.isChecked(), false);
      await automaticReuse.check();
    }
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
    assert.equal(
      await draft.inputValue(),
      quietRecruiter ? '' : recruiterPanelDraft
    );
    assert.equal(fixture.effects.length, 0);
    await shot('desktop', status.locator('..'));
    await shot('native', nativePanel);
    if (quietRecruiter) {
      await verifyRecruiterQuiet({
        draft,
        fixture,
        frame,
        nativePanel,
        owned,
        quietRecruiter,
        shot,
      });
      await phase('completed');
      assert.equal(owned.isClosed(), true);
      assert.equal(fixture.effects.length, 1);
      assert.equal(
        fixture.effects[0].recruiterSends,
        quietRecruiter === 'first' ? 0 : 2
      );
      assert.equal(fixture.effects[0].recruiterCloses, 1);
      assert(fixture.records.every((record) => record.closed));
      assert.deepEqual(fixture.errors, []);
      await controls.phone();
      await panel.locator('[data-application-action="recover"]').click();
      const dismissal = panel.locator(
        '[data-application-recruiter-dismissal="quiet"]'
      );
      await dismissal.waitFor();
      await shot(`quiet-${quietRecruiter}-after`, dismissal.locator('..'));
      return {
        applicationSends: 1,
        recruiterWait: quietRecruiter,
        ...fixture.effects[0],
      };
    }
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
    if (prepareReply) {
      await verifyRecruiterDraftReview({
        draft,
        frame,
        nativePanel,
        panel,
        status,
        shot,
      });
    }
    if (exactReply) {
      await verifyExactRecruiterReplies({
        draft,
        frame,
        nativePanel,
        panel,
        fixture,
        shot,
      });
    }
    if (reuseReply) {
      await verifyRecruiterReuse({ frame, nativePanel, panel, fixture, shot });
      if (skipRecruiter) {
        await draft.evaluate((composer) => {
          const row = document.createElement('article');
          row.dataset.qa = 'chatik-chat-message-8';
          row.dataset.time = '2026-11-24T09:05:00Z';
          const body = document.createElement('p');
          body.dataset.qa = 'chat-bubble-text';
          body.textContent = 'Could you share your portfolio?';
          row.append(body);
          composer.closest('label').before(row);
        });
      }
    }
    const dismiss = skipRecruiter
      ? () =>
          verifyRecruiterSkip({
            panel,
            owned,
            draft,
            nativePanel,
            web: page,
            shot,
          })
      : terminal
        ? () =>
            verifyRecruiterTerminal({ owned, frame, nativePanel, draft, shot })
        : () =>
            nativePanel
              .getByRole('button', { name: 'Close recruiter panel' })
              .click();
    await verifyRecruiterPanelRecovery({
      controls,
      page,
      phase,
      button,
      status,
      receipt,
      owned,
      draft,
      fixture,
      shot,
      dismiss,
    });
    if (terminal || skipRecruiter) {
      if (skipRecruiter) {
        assert.equal(fixture.effects[0].recruiterSends, reuseReply ? 2 : 0);
        assert.equal(fixture.effects[0].recruiterCloses, 1);
      }
      await panel.locator('[data-application-action="recover"]').click();
      const reason = skipRecruiter ? 'skipped' : 'completed';
      const dismissal = panel.locator(
        `[data-application-recruiter-dismissal="${reason}"]`
      );
      await dismissal.waitFor();
      await shot(
        skipRecruiter ? 'skip-after' : 'terminal-after',
        dismissal.locator('..')
      );
    }
    return {
      applicationsSent: 1,
      manualSend,
      exactSearchVisits: 2,
      draftPreserved: true,
      ...(prepareReply && {
        approximateDraftConfirmed: true,
        recruiterSends: 0,
      }),
      ...(exactReply && { exactRepliesConfirmed: 2 }),
      ...(skipRecruiter
        ? { batchCompletedAfterExplicitSkip: true }
        : terminal
          ? { batchCompletedAfterVerifiedTerminalDismissal: true }
          : { batchCompletedAfterOwnerDismissal: true }),
      resourcesClosed: true,
    };
  } finally {
    await fixture.close();
  }
};

export const verifyNativeApplicationRecruiterLearning = (browser) =>
  verifyNativeApplicationRecruiterPanel(browser, { ownerReply: true });

export const verifyNativeApplicationRecruiterDraft = (browser) =>
  verifyNativeApplicationRecruiterPanel(browser, {
    prepareReply: true,
    panelDelayMs: 0,
    verifyBinding: false,
  });

export const verifyNativeApplicationRecruiterExact = (browser) =>
  verifyNativeApplicationRecruiterPanel(browser, {
    exactReply: true,
    terminal: true,
    panelDelayMs: 0,
    verifyBinding: false,
  });

export const verifyNativeApplicationRecruiterReuse = (browser) =>
  verifyNativeApplicationRecruiterPanel(browser, {
    reuseReply: true,
    skipRecruiter: true,
    manualSend: true,
    panelDelayMs: 0,
    verifyBinding: false,
  });

export const verifyNativeFirstRecruiterWait = (browser) =>
  verifyNativeApplicationRecruiterPanel(browser, {
    quietRecruiter: 'first',
    manualSend: true,
    panelDelayMs: 0,
  });

export const verifyNativeNextRecruiterWait = (browser) =>
  verifyNativeApplicationRecruiterPanel(browser, {
    quietRecruiter: 'next',
    manualSend: true,
    panelDelayMs: 0,
  });
