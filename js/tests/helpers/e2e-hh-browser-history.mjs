import assert from 'node:assert/strict';
import { learnAnswerRules } from '../../src/automation/question-learning.js';
import { providerChoiceDraft } from '../../../experiments/issue-56/provider-choice-fixture.mjs';

/** Real native history extraction, normalization, learning and guarded actions. */
export const verifyHhBrowserHistory = async ({
  run,
  page,
  sender,
  args,
  mount,
  counters,
  screenshot,
}) => {
  const reset = async () => {
    await page.goto('https://hh.ru/chat/7');
    await sender.readRecent(args);
  };
  const append = (records) =>
    page.evaluate((items) => {
      for (const [index, item] of items.entries()) {
        const row = document.createElement('article');
        row.dataset.qa = `chatik-chat-message-${102 + index}`;
        row.dataset.time = `2026-11-11T10:00:0${index + 1}Z`;
        if (item.title) {
          const title = document.createElement('strong');
          title.dataset.qa = 'chat-bubble-title';
          title.textContent = item.title;
          row.append(title);
        }
        const body = document.createElement('p');
        body.dataset.qa = 'chat-bubble-text';
        body.textContent = item.body ?? '';
        row.append(body);
        if (item.outgoing) {
          row.className = 'outgoing';
          const status = document.createElement('span');
          status.dataset.qa = 'status-icon-delivered';
          row.append(status);
        }
        document.querySelector('#history').append(row);
      }
    }, records);
  await run(
    'browser application letters never become learned answers',
    async () => {
      await reset();
      await append([
        {
          title: 'Отклик на вакансию',
          body: 'Yes, five years of production experience.',
          outgoing: true,
        },
      ]);
      const messages = await sender.readRecent(args);
      const learned = learnAnswerRules(messages);
      await page.locator('#status').evaluate(
        (element, state) => {
          element.textContent = `Read-only history evidence · Service records: ${state.service} · Learned answer rules: ${state.learned} · Expected: 1 service record, 0 learned rules`;
        },
        {
          service: messages.filter((row) => row.service).length,
          learned: learned.length,
        }
      );
      await screenshot('history');
      assert.equal(learned.length, 0, 'cover letters are not observed answers');
      assert.equal(messages[1].service, true);
      assert.deepEqual(await counters(), { clicks: 0, text: 0 });
    }
  );
  await run(
    'empty application barriers survive normalization without bridging turns',
    async () => {
      await reset();
      await append([
        { title: 'Vacancy application', outgoing: true },
        { body: 'Yes, five years of production experience.', outgoing: true },
        {
          title: 'Recruiter bot',
          body: 'Which programming language do you use?',
        },
        { body: 'TypeScript for production services.', outgoing: true },
      ]);
      const messages = await sender.readRecent(args);
      assert.equal(messages.length, 5);
      assert.equal(messages[1].service, true);
      assert.equal(messages[1].body, '');
      const learned = learnAnswerRules(messages);
      assert.equal(learned.length, 1);
      assert.equal(
        learned[0].question,
        'Which programming language do you use?'
      );
      assert.equal(learned[0].answers[0].approved, false);
    }
  );
  await run(
    'history reads preserve owned drafts when native choices appear',
    async () => {
      await reset();
      const expected = await sender.readAnswerChoices(args);
      await sender.prefillAnswer({
        ...args,
        expected,
        text: 'Owned review draft',
      });
      await mount();
      const messages = await sender.readRecent(args);
      assert.equal(messages[0].strictOptions, true);
      assert.deepEqual(messages[0].answerOptions, ['Yes.', 'No.']);
      assert.equal(
        await page.locator('textarea').inputValue(),
        'Owned review draft'
      );
      // Answer inspection still performs its explicit owned-draft reconciliation.
      await sender.readAnswerChoices(args);
      assert.equal(await page.locator('textarea').inputValue(), '');
    }
  );
  await verifyHistoryActions({
    run,
    page,
    sender,
    args,
    mount,
    counters,
    reset,
  });
};

const verifyHistoryActions = async ({
  run,
  page,
  sender,
  args,
  mount,
  counters,
  reset,
}) => {
  await run(
    'application metadata invalidates stale prefill and choice plans',
    async () => {
      await reset();
      const expected = await sender.readAnswerChoices(args);
      await page.locator('article').evaluate((row) => {
        const title = document.createElement('strong');
        title.dataset.qa = 'chat-bubble-author-name';
        title.textContent = 'Vacancy application';
        row.prepend(title);
      });
      assert.equal((await sender.readRecent(args))[0].service, true);
      await assert.rejects(sender.readAnswerChoices(args), {
        code: 'answer-question-unavailable',
      });
      await assert.rejects(
        sender.prefillAnswer({ ...args, expected, text: 'Unwanted reply' }),
        { code: 'answer-draft-preserved' }
      );
      await mount();
      await assert.rejects(sender.chooseAnswer(providerChoiceDraft()), {
        code: 'answer-choice-changed',
      });
      assert.equal(await page.locator('textarea').inputValue(), '');
      assert.deepEqual(await counters(), { clicks: 0, text: 0 });
    }
  );
  await run(
    'an application bubble cannot confirm a native selection',
    async () => {
      await reset();
      await mount();
      await page.evaluate(() => {
        document.querySelector('#choices button').onclick = () => {
          window.fixture.clicks++;
          const row = document.createElement('article');
          row.dataset.qa = 'chatik-chat-message-102';
          row.innerHTML =
            '<strong data-qa="chat-bubble-title">Vacancy application</strong><p data-qa="chat-bubble-text">Yes.</p><span data-qa="status-icon-delivered"></span>';
          document.querySelector('#history').append(row);
          const next = document.createElement('article');
          next.dataset.qa = 'chatik-chat-message-103';
          next.innerHTML =
            '<p data-qa="chat-bubble-text">Can you work remotely?</p>';
          document.querySelector('#history').append(next);
        };
      });
      await assert.rejects(sender.chooseAnswer(providerChoiceDraft()), {
        code: 'send-unknown',
      });
      assert.deepEqual(await counters(), { clicks: 1, text: 0 });
      assert.equal((await sender.readRecent(args))[1].service, true);
    }
  );
};
