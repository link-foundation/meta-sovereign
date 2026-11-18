import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { browserChoicePage } from '../../src/sources/browser-choices.js';
import {
  providerChoiceHtml,
  providerChoiceUi,
} from '../../../experiments/issue-56/provider-choice-fixture.mjs';
import {
  prepareChoiceVisibility,
  choiceVisibilityReceipt,
  choiceVisibilityState,
} from '../../../experiments/issue-56/choice-visibility-fixture.mjs';

const verifyRevealed = async (page, layout, screenshot) => {
  await prepareChoiceVisibility(page, layout);
  assert.equal((await choiceVisibilityState(page)).visible, false);
  const receipt = await choiceVisibilityReceipt(page);
  await screenshot(layout);
  assert.equal(receipt.sent, true);
  assert.equal(receipt.messageId, '102');
  assert.equal((await choiceVisibilityState(page)).visible, true);
  // A repeated positive readback must never take the view back from the owner.
  await page.evaluate(() => {
    document.querySelector('#history').scrollTop = 0;
  });
  assert.equal((await choiceVisibilityReceipt(page)).sent, true);
  assert.equal((await choiceVisibilityState(page)).visible, false);
  assert.equal((await choiceVisibilityState(page)).clicks, 1);
  assert.equal((await choiceVisibilityState(page)).textSends, 0);
};

const verifyOwnerView = async (page, action) => {
  await prepareChoiceVisibility(page, 'ordinary');
  if (action === 'draft') {
    // Provider-side restored drafts can appear without an input event.
    await page.evaluate(() => {
      document.querySelector('textarea').value = 'My restored reply';
    });
  } else if (action === 'typing' || action === 'reverted') {
    await page.locator('textarea').fill('My new reply');
    if (action === 'reverted') {
      await page.locator('textarea').fill('');
    }
  } else if (action === 'wheel') {
    await page.locator('#history').hover();
    await page.mouse.wheel(0, 60);
    await page.evaluate(() => new Promise(window.requestAnimationFrame));
  } else if (action === 'touch') {
    await page.locator('#history').dispatchEvent('touchmove');
  } else if (action === 'pointer') {
    await page.locator('#history').click({ position: { x: 4, y: 4 } });
  } else {
    await page.keyboard.press('PageUp');
  }
  const before = await choiceVisibilityState(page);
  assert.equal(before.visible, false);
  const receipt = await choiceVisibilityReceipt(page);
  assert.equal(receipt.sent, true);
  assert.equal(receipt.messageId, '102');
  assert.deepEqual(await choiceVisibilityState(page), before);
};

/** Finite native-choice receipt/reveal checks; no live provider or text send. */
export const verifyChoiceVisibility = async (browser, { screenshots } = {}) => {
  const server = createServer((_req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end(`${providerChoiceHtml}<script>
      window.choiceSpec=${JSON.stringify(providerChoiceUi(base))};
      window.choiceControl=(${browserChoicePage.toString()});
    </script>`);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext({
    viewport: { width: 1050, height: 800 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const failures = [];
  const totals = { nativeClicks: 0, textSends: 0 };
  let cases = 0;
  const run = async (name, check) => {
    await page.goto(`${base}/chat/7`);
    try {
      await check();
      const state = await choiceVisibilityState(page);
      assert.equal(state.clicks, 1);
      assert.equal(state.textSends, 0);
      totals.nativeClicks += state.clicks;
      totals.textSends += state.textSends;
      console.log(`[choice-visibility] PASS ${name}`);
    } catch (error) {
      failures.push({ name, error: error.stack });
      console.log(`[choice-visibility] FAIL ${name}: ${error.message}`);
    }
    cases++;
  };
  const screenshot = async (name) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await page.screenshot({ path: join(screenshots, `choice-${name}.png`) });
    }
  };
  try {
    for (const layout of ['ordinary', 'reversed']) {
      await run(`${layout} confirmed bubble is revealed once`, () =>
        verifyRevealed(page, layout, screenshot)
      );
    }
    for (const action of [
      'draft',
      'typing',
      'reverted',
      'wheel',
      'touch',
      'pointer',
      'keyboard',
    ]) {
      await run(`${action} preserves owner view and delivery receipt`, () =>
        verifyOwnerView(page, action)
      );
    }
    await run('a view exception cannot erase a positive receipt', async () => {
      await prepareChoiceVisibility(page, 'ordinary');
      await page.evaluate(() => {
        document.querySelector(
          '[data-qa="chatik-chat-message-102"]'
        ).scrollIntoView = () => {
          throw new Error('Synthetic layout failure');
        };
      });
      assert.equal((await choiceVisibilityReceipt(page)).sent, true);
      assert.equal((await choiceVisibilityState(page)).clicks, 1);
    });
    await run(
      'a selected different conversation receives no confirmation or reveal',
      async () => {
        await prepareChoiceVisibility(page, 'ordinary');
        await page.evaluate(() =>
          window.history.replaceState(null, '', '/chat/8')
        );
        const before = await choiceVisibilityState(page);
        assert.equal(
          (await choiceVisibilityReceipt(page)).code,
          'send-unknown'
        );
        assert.deepEqual(await choiceVisibilityState(page), before);
      }
    );
    assert.deepEqual(failures, []);
    return { cases, ...totals };
  } finally {
    await context.close();
    await new Promise((resolve) => server.close(resolve));
  }
};
