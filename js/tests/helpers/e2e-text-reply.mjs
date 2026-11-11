import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { withHhBrowserScanFixture } from './e2e-hh-chat-scan.mjs';
import {
  textReplyHtml,
  textReplyBody,
} from '../../../experiments/issue-56/text-reply-fixture.mjs';
import { providerChoiceDraft } from '../../../experiments/issue-56/provider-choice-fixture.mjs';

const args = { source: 'hh', chat: '7' };
const withText = (browser, options, run) =>
  withHhBrowserScanFixture(
    browser,
    {
      html: textReplyHtml,
      choiceReceiptMs: 100,
      ...options,
      isRead: ({ args: values }) => values?.[0]?.operation === 'armText',
    },
    run
  );
const stateOf = (target) => target.evaluate(() => window.textReplyState());
const read = (sender, target = args) => sender.readAnswerChoices(target);
const send = (sender, expected, target = args) =>
  sender.replyText({ ...target, expected, text: textReplyBody });
const screenshot = async (page, directory, name) => {
  if (directory) {
    await mkdir(directory, { recursive: true });
    await page.screenshot({
      path: join(directory, `text-reply-${name}.png`),
      fullPage: true,
    });
  }
};

/** Finite native text effects, frozen turns and strict positive receipts. */
export const verifyTextReplies = async (
  browser,
  { before = false, screenshots, part = 'all' } = {}
) => {
  const outcomes = [];
  const run = async (name, options, check) => {
    await withText(browser, options, async (fixture) => {
      await read(fixture.sender);
      await check(fixture);
      outcomes.push(name);
      console.log(`[text-reply] PASS ${name}`);
    });
  };
  if (before) {
    await withText(browser, {}, async ({ sender, page }) => {
      await read(sender);
      assert.equal(typeof sender.replyText, 'undefined');
      await page.locator('#status').evaluate((n) => {
        n.textContent = 'Frozen text reply unavailable';
      });
      await screenshot(page, screenshots, 'before');
      assert.equal((await stateOf(page)).sends, 0);
    });
    return { unavailableBefore: true, liveProvider: false };
  }
  if (part === 'all' || part === 'controls') {
    await verifyTextReceipts(run, screenshots);
    await verifyTextRefusals(run);
  }
  if (part !== 'guards') {
    await verifyTextReservations(run);
  }
  if (part === 'all' || part === 'guards') {
    await verifyTextRaces(run);
    await verifyTextFrames(browser, outcomes, screenshots);
  }
  return { cases: outcomes.length, outcomes, liveProvider: false };
};

export const verifyTextReplyControls = (browser) =>
  verifyTextReplies(browser, { part: 'controls' });
export const verifyTextReplyGuards = (browser) =>
  verifyTextReplies(browser, { part: 'guards' });

const verifyTextReceipts = async (run, screenshots) => {
  for (const receipt of ['normal', 'delayed']) {
    await run(receipt, {}, async ({ sender, page }) => {
      await page.evaluate((value) => {
        window.fixture.receipt = value;
      }, receipt);
      const result = await send(sender, await read(sender));
      assert.equal(result.messageId, '102');
      assert.equal(result.text, textReplyBody);
      const state = await stateOf(page);
      assert.equal(state.sends, 1);
      assert.equal(state.choices, 0);
      assert.equal(state.hooks, 0);
      assert.equal(state.draft, '');
      assert.equal(state.replies.at(-1).body, textReplyBody);
      assert.equal(state.replies.at(-1).outgoing, true);
      if (receipt === 'normal') {
        await screenshot(page, screenshots, 'after');
      }
    });
  }
};

export const verifyTextReservations = async (run) => {
  for (const direction of [
    'text-to-text',
    'text-to-choice',
    'choice-to-text',
  ]) {
    await run(direction, {}, async ({ sender, page }) => {
      await page.evaluate(() => {
        window.fixture.receipt = 'none';
      });
      if (direction === 'choice-to-text') {
        await page.evaluate(() => window.mountChoices());
        await assert.rejects(sender.chooseAnswer(providerChoiceDraft()), {
          code: 'send-unknown',
        });
        await page.locator('#choices').evaluate((node) => {
          node.replaceChildren();
          node.className = '';
        });
      } else {
        await assert.rejects(send(sender, await read(sender)), {
          code: 'send-unknown',
        });
        if (direction === 'text-to-choice') {
          await page.evaluate(() => window.mountChoices());
          await read(sender);
          assert.equal((await stateOf(page)).draft, textReplyBody);
          await assert.rejects(sender.chooseAnswer(providerChoiceDraft()), {
            code: 'answer-draft-preserved',
          });
        }
        await page.locator('textarea').fill('');
      }
      if (direction === 'text-to-choice') {
        await page.evaluate(() => window.mountChoices());
        await assert.rejects(sender.chooseAnswer(providerChoiceDraft()), {
          code: 'send-in-doubt',
        });
      } else {
        await assert.rejects(send(sender, await read(sender)), {
          code: 'send-in-doubt',
        });
      }
      const state = await stateOf(page);
      assert.equal(state.sends, direction === 'choice-to-text' ? 0 : 1);
      assert.equal(state.choices, direction === 'choice-to-text' ? 1 : 0);
      assert.equal(state.draft, '');
      assert.equal(state.hooks, 0);
    });
  }
};

const verifyTextRefusals = async (run) => {
  for (const receipt of ['none', 'incoming', 'historical', 'duplicate']) {
    await run(`unknown-${receipt}`, {}, async ({ sender, page }) => {
      const expected = await read(sender);
      await page.evaluate((value) => {
        window.fixture.receipt = value;
      }, receipt);
      await assert.rejects(send(sender, expected), {
        code: 'send-unknown',
        ambiguous: true,
        fallback: false,
      });
      assert.equal((await stateOf(page)).sends, 1);
      assert.equal((await stateOf(page)).hooks, 0);
      // A second request never dispatches, even if receipt visibility changes.
      await assert.rejects(send(sender, expected));
      assert.equal((await stateOf(page)).sends, 1);
    });
  }
  for (const refusal of [
    'draft',
    'whitespace',
    'readonly',
    'aria-readonly',
    'disabled',
    'aria-disabled',
    'closed',
    'no-composer',
    'no-send',
    'disabled-send',
    'duplicate-send',
    'choices',
  ]) {
    await run(`refuse-${refusal}`, {}, async ({ sender, page }) => {
      const expected = await read(sender);
      await page.evaluate((value) => {
        const input = document.querySelector('textarea');
        const button = document.querySelector('#send');
        if (value === 'draft' || value === 'whitespace') {
          input.value = value === 'draft' ? 'Owner draft' : ' ';
        }
        if (value === 'readonly') {
          input.readOnly = true;
        }
        if (value === 'aria-readonly') {
          input.setAttribute('aria-readonly', 'true');
        }
        if (value === 'disabled') {
          input.disabled = true;
        }
        if (value === 'aria-disabled') {
          input.parentElement.setAttribute('aria-disabled', 'true');
        }
        if (value === 'no-composer') {
          input.remove();
        }
        if (value === 'no-send') {
          button.remove();
        }
        if (value === 'disabled-send') {
          button.disabled = true;
        }
        if (value === 'duplicate-send') {
          button.after(button.cloneNode(true));
        }
        if (value === 'choices') {
          window.mountChoices();
        }
        if (value === 'closed') {
          document.querySelector('#status').textContent =
            'Работодатель отключил переписку по данной вакансии';
        }
      }, refusal);
      const draft = (await stateOf(page)).draft;
      await assert.rejects(send(sender, expected));
      const state = await stateOf(page);
      assert.equal(state.sends, 0);
      assert.equal(state.choices, 0);
      assert.equal(state.hooks, 0);
      assert.equal(state.draft, draft);
    });
  }
};

const verifyTextRaces = async (run) => {
  for (const race of [
    'edited-question',
    'edited-earlier',
    'draft',
    'reverted-draft',
    'silent-draft',
    'readonly',
    'composer-replaced',
    'send-replaced',
    'closed',
    'choices',
    'wheel',
    'touch',
    'navigation',
  ]) {
    await run(
      `race-${race}`,
      {
        onRead: async (page, result) => {
          if (!result.armed) {
            return;
          }
          await page.evaluate((value) => {
            const input = document.querySelector('textarea');
            const button = document.querySelector('#send');
            if (value === 'edited-question') {
              document.querySelector(
                '[data-qa="chat-bubble-text"]'
              ).textContent = 'Changed question';
            }
            if (value === 'edited-earlier') {
              document.querySelector(
                '[data-qa="chat-bubble-text"]'
              ).textContent = 'Changed earlier request';
            }
            if (['draft', 'reverted-draft', 'silent-draft'].includes(value)) {
              input.value = 'Owner replacement';
              if (value !== 'silent-draft') {
                input.dispatchEvent(
                  new window.Event('input', { bubbles: true })
                );
              }
              if (value === 'reverted-draft') {
                input.value = window.replyBody;
                input.dispatchEvent(
                  new window.Event('input', { bubbles: true })
                );
              }
            }
            if (value === 'readonly') {
              input.readOnly = true;
            }
            if (value === 'composer-replaced') {
              input.replaceWith(input.cloneNode(true));
            }
            if (value === 'send-replaced') {
              const copy = button.cloneNode(true);
              copy.onclick = button.onclick;
              button.replaceWith(copy);
            }
            if (value === 'choices') {
              window.mountChoices();
            }
            if (value === 'closed') {
              document.querySelector('#status').textContent =
                'This conversation is closed';
            }
            if (value === 'wheel') {
              document.dispatchEvent(
                new window.WheelEvent('wheel', { bubbles: true, deltaY: 30 })
              );
            }
            if (value === 'touch') {
              document.dispatchEvent(
                new window.Event('touchmove', { bubbles: true })
              );
            }
            if (value === 'navigation') {
              window.history.replaceState(null, '', '/chat/8');
            }
          }, race);
        },
      },
      async ({ sender, page }) => {
        await page.evaluate((body) => {
          window.replyBody = body;
        }, textReplyBody);
        if (race === 'edited-earlier') {
          await page.evaluate(() => {
            const row = document.querySelector('article').cloneNode(true);
            row.dataset.qa = 'chatik-chat-message-99';
            row.querySelector('p').textContent =
              'Please also describe your availability.';
            document.querySelector('#history').prepend(row);
          });
        }
        await assert.rejects(send(sender, await read(sender)));
        const state = await stateOf(page);
        assert.equal(state.sends, 0);
        assert.equal(state.choices, 0);
        assert.equal(state.hooks, 0);
        if (race === 'draft' || race === 'silent-draft') {
          assert.equal(state.draft, 'Owner replacement');
        }
        if (race === 'reverted-draft') {
          assert.equal(state.draft, textReplyBody);
        }
        if (
          race === 'wheel' ||
          race === 'touch' ||
          race === 'edited-question' ||
          race === 'edited-earlier' ||
          race === 'choices'
        ) {
          assert.equal(state.draft, '');
        }
      }
    );
  }
};

const verifyTextFrames = async (browser, outcomes, screenshots) => {
  await withText(
    browser,
    { frames: [{ url: 'https://chatik.hh.ru/chat/7' }] },
    async ({ sender, page }) => {
      const target = { ...args, browserUrl: 'https://hh.ru/vacancy/42' };
      const expected = await read(sender, target);
      const result = await send(sender, expected, target);
      assert.equal(result.messageId, '102');
      const child = page
        .frames()
        .find((frame) => frame.url() === 'https://chatik.hh.ru/chat/7');
      const state = await stateOf(child);
      assert.equal(state.sends, 1);
      assert.equal(state.hooks, 0);
      assert.equal(page.url(), target.browserUrl);
      await screenshot(page, screenshots, 'frame-after');
      outcomes.push('visible-child');
    }
  );
  await withText(browser, {}, async ({ sender, page }) => {
    const watch = await sender.openAnswerWatch(args);
    const expected = await watch.read();
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const pending = watch.replyText(expected, textReplyBody, () => gate);
    expected.question.body = 'Caller changed its object';
    expected.pendingTurn.messages[0].body = expected.question.body;
    release();
    assert.equal((await pending).messageId, '102');
    await watch.close();
    assert.equal((await stateOf(page)).sends, 1);
    assert.equal((await stateOf(page)).hooks, 0);
    outcomes.push('watch-frozen-intent');
  });
};
