import assert from 'node:assert/strict';
import { createMemoryStore } from '../../src/storage/universal.js';
import { learnArchivedAnswers } from '../../src/automation/question-archive.js';
import { providerChoiceDraft } from '../../../experiments/issue-56/provider-choice-fixture.mjs';

const installReply = (
  page,
  status,
  { delayed = false, onClick = false } = {}
) =>
  page.evaluate(
    ({ status, delayed, onClick }) => {
      const append = () => {
        const row = document.createElement('article');
        row.dataset.qa = 'chatik-chat-message-102';
        row.dataset.time = '2026-11-11T10:00:01Z';
        row.className = 'chat-bubble_outgoing';
        row.innerHTML = '<p data-qa="chat-bubble-text">Yes.</p>';
        for (const value of status) {
          const icon = document.createElement('span');
          icon.dataset.qa = `status-icon-${value}`;
          row.append(icon);
        }
        document.querySelector('#history').append(row);
        if (delayed) {
          setTimeout(() => {
            row.querySelector('span').dataset.qa = 'status-icon-delivered';
          }, 30);
        }
      };
      if (onClick) {
        document.querySelector('#choices button').onclick = () => {
          window.fixture.clicks++;
          append();
        };
      } else {
        append();
      }
    },
    { status, delayed, onClick }
  );

/** Provider-shaped DOM, production extraction/normalization/receipt and learner. */
export const verifyHhDelivery = async ({
  run,
  reset,
  page,
  sender,
  args,
  mount,
  counters,
}) => {
  await run(
    'native HH delivery states survive extraction and withhold uncertain answers',
    async () => {
      for (const [icons, expected] of [
        [['sending'], 'pending'],
        [['failed'], 'failed'],
        [['unfamiliar'], 'unknown'],
        [[], 'unknown'],
        [['sent', 'failed'], 'unknown'],
        [['sent'], 'sent'],
        [['delivered'], 'delivered'],
        [['read'], 'read'],
      ]) {
        await reset();
        await installReply(page, icons);
        const messages = await sender.readRecent(args);
        assert.equal(messages[1].outgoing, true);
        assert.equal(messages[1].delivery, expected);
        const store = createMemoryStore();
        await store.putMany(messages);
        const learned = await learnArchivedAnswers(store);
        assert.equal(
          learned.rules.length,
          ['sent', 'delivered', 'read'].includes(expected) ? 1 : 0
        );
        assert.deepEqual(await counters(), { clicks: 0, text: 0 });
      }
    }
  );
  await run(
    'pending and conflicting native icons cannot confirm a dispatched choice',
    async () => {
      for (const icons of [['sending'], ['sent', 'failed']]) {
        await reset();
        await mount();
        await installReply(page, icons, { onClick: true });
        await assert.rejects(sender.chooseAnswer(providerChoiceDraft()), {
          code: 'send-unknown',
        });
        assert.deepEqual(await counters(), { clicks: 1, text: 0 });
      }
    }
  );
  await run(
    'a later native delivery icon confirms the original single choice attempt',
    async () => {
      await reset();
      await mount();
      await installReply(page, ['sending'], { onClick: true, delayed: true });
      const receipt = await sender.chooseAnswer(providerChoiceDraft());
      assert.equal(receipt.messageId, '102');
      assert.equal((await sender.readRecent(args))[1].delivery, 'delivered');
      assert.deepEqual(await counters(), { clicks: 1, text: 0 });
    }
  );
};
