/* global Event */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { makeBrowserCommander } from 'browser-commander';
import {
  createBrowserSender,
  createDefaultSender,
} from '../../src/sources/browser-sender.js';
import {
  providerChoiceHtml,
  providerChoiceUi,
  providerChoiceDraft,
} from '../../../experiments/issue-56/provider-choice-fixture.mjs';

/** Native commander actions against one isolated provider document at a time. */
export const verifyProviderChoices = async (browser, { screenshots } = {}) => {
  const server = createServer((_req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end(providerChoiceHtml);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext({
    viewport: { width: 1050, height: 800 },
  });
  const page = await context.newPage();
  const commander = makeBrowserCommander({
    page,
    enableNetworkTracking: false,
    enableNavigationManager: false,
    enableDialogManager: false,
  });
  let beforeClick;
  let afterClick;
  const proxy = Object.create(commander);
  proxy.clickButton = async (options) => {
    if (beforeClick) {
      const run = beforeClick;
      beforeClick = null;
      await run();
    }
    const result = await commander.clickButton(options);
    if (afterClick) {
      const run = afterClick;
      afterClick = null;
      await run();
    }
    return result;
  };
  const ui = providerChoiceUi(base);
  const sender = createBrowserSender({
    platforms: { hh: ui },
    pollMs: 10,
    loginTimeoutMs: 1000,
    choiceReceiptMs: 750,
    openSession: async () => ({
      commander: proxy,
      page,
      close: () => context.close(),
    }),
  });
  const forbidden = [];
  const send = createDefaultSender({
    browser: sender,
    getSource: () => ({
      live: {
        post: () => {
          forbidden.push('api-text');
        },
      },
    }),
  });
  const args = { source: 'hh', chat: '7' };
  const read = () => sender.readAnswerChoices(args);
  const reset = async () => {
    await page.goto(`${base}/chat/7`);
    beforeClick = null;
    afterClick = null;
  };
  const mount = (options = ['Yes.', 'No.']) =>
    page.evaluate((labels) => window.mountChoices(labels), options);
  const draftValue = () => page.locator('textarea').inputValue();
  const counts = () =>
    page.evaluate(() => ({
      clicks: window.fixture.clicks,
      text: window.fixture.textSends,
    }));
  const screenshot = async (name) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await page.screenshot({
        path: join(screenshots, `provider-choices-${name}.png`),
      });
    }
  };
  let cases = 0;
  const run = async (name, verify) => {
    await reset();
    await verify();
    cases++;
    console.log(`[provider-choices] PASS ${name}`);
  };
  try {
    // Prime the owned session before mounting controls; its first open navigates.
    await sender.readRecent(args);
    const fixture = {
      run,
      page,
      sender,
      args,
      read,
      mount,
      send,
      draftValue,
      counts,
      screenshot,
      base,
      before: (fn) => {
        beforeClick = fn;
      },
      after: (fn) => {
        afterClick = fn;
      },
    };
    await verifyChoiceDrafts(fixture);
    await verifyChoiceReading(fixture);
    await verifyChoiceDispatch(fixture);
    await verifyChoiceReceipts(fixture);
    assert.deepEqual(forbidden, []);
    return { cases, apiTextWrites: forbidden.length };
  } finally {
    await commander.destroy();
    await sender.close();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
};

const verifyChoiceDrafts = async ({
  run,
  mount,
  screenshot,
  sender,
  args,
  send,
  counts,
  draftValue,
  read,
  page,
}) => {
  await run(
    'native exact choice, current metadata and positive message receipt',
    async () => {
      await mount();
      await screenshot('before');
      const links = await sender.readRecent(args);
      assert.equal(links.at(-1).strictOptions, true);
      assert.deepEqual(links.at(-1).answerOptions, ['Yes.', 'No.']);
      assert.equal(links.at(-1).id, 'msg:hh:7:101');
      const result = await send(providerChoiceDraft());
      assert.equal(result.messageId, '102');
      assert.equal(result.option, 'Yes.');
      assert.deepEqual(await counts(), { clicks: 1, text: 0 });
      assert.equal(await draftValue(), '');
      await screenshot('after');
    }
  );
  await run(
    'generic starters leave ordinary text prefilling available',
    async () => {
      const current = await read();
      assert.equal(current.strictOptions, false);
      assert.deepEqual(current.answerOptions, []);
      assert.deepEqual(
        await sender.prefillAnswer({
          ...args,
          expected: current,
          text: 'Yes.',
        }),
        { prefilled: true }
      );
      assert.equal(await draftValue(), 'Yes.');
      assert.deepEqual(await counts(), { clicks: 0, text: 0 });
    }
  );
  await run(
    'delayed choices clear only the unchanged automatic draft',
    async () => {
      await sender.prefillAnswer({
        ...args,
        expected: await read(),
        text: 'Yes.',
      });
      await mount();
      assert.equal((await read()).hasDraft, false);
      assert.equal(await draftValue(), '');
      assert.equal((await send(providerChoiceDraft())).messageId, '102');
    }
  );
  await run(
    'edited and reverted owner drafts survive delayed choices',
    async () => {
      await sender.prefillAnswer({
        ...args,
        expected: await read(),
        text: 'Yes.',
      });
      await page.locator('textarea').fill('Owner correction');
      await page.locator('textarea').fill('Yes.');
      await mount();
      assert.equal((await read()).hasDraft, true);
      await assert.rejects(send(providerChoiceDraft()), {
        code: 'answer-draft-preserved',
      });
      assert.equal(await draftValue(), 'Yes.');
      assert.deepEqual(await counts(), { clicks: 0, text: 0 });
      await screenshot('owner-draft');
    }
  );
  await run('automatic draft from an older question is retained', async () => {
    await sender.prefillAnswer({
      ...args,
      expected: await read(),
      text: 'Yes.',
    });
    await page.locator('article').evaluate((node) => {
      node.dataset.qa = 'chatik-chat-message-202';
    });
    await mount();
    assert.equal((await read()).hasDraft, true);
    assert.equal(await draftValue(), 'Yes.');
  });
  await run('disabled choices stay strict and pending', async () => {
    await page.evaluate(() => window.mountChoices(['Yes.', 'No.'], true));
    const current = await read();
    assert.equal(current.strictOptions, true);
    assert.deepEqual(current.answerOptions, []);
    await assert.rejects(send(providerChoiceDraft()), {
      code: 'answer-choice-changed',
    });
    assert.deepEqual(await counts(), { clicks: 0, text: 0 });
  });
  await run('duplicate displayed labels are never guessed', async () => {
    await mount(['Yes.', 'Yes.']);
    await assert.rejects(send(providerChoiceDraft(['Yes.', 'Yes.'])), {
      code: 'answer-choice-changed',
    });
    assert.deepEqual(await counts(), { clicks: 0, text: 0 });
  });
  await run(
    'the direct browser sender also uses an actual option click',
    async () => {
      await mount();
      assert.equal((await sender.send(providerChoiceDraft())).messageId, '102');
      assert.deepEqual(await counts(), { clicks: 1, text: 0 });
    }
  );
};

const verifyChoiceReading = async ({
  run,
  mount,
  page,
  read,
  send,
  counts,
}) => {
  await run(
    'older question controls cannot answer the latest message',
    async () => {
      await mount();
      await page.evaluate(() => {
        const row = document.createElement('article');
        row.dataset.qa = 'chatik-chat-message-100';
        const body = document.createElement('p');
        body.dataset.qa = 'chat-bubble-text';
        body.textContent = 'An older question?';
        row.append(body, document.querySelector('#choices'));
        document.querySelector('#history').prepend(row);
      });
      assert.equal((await read()).strictOptions, false);
      await assert.rejects(send(providerChoiceDraft()), {
        code: 'answer-choice-changed',
      });
      assert.deepEqual(await counts(), { clicks: 0, text: 0 });
    }
  );
  await run(
    'an unrelated modal choice group cannot answer the chat',
    async () => {
      await mount();
      await page
        .locator('#choices')
        .evaluate((node) => node.setAttribute('role', 'dialog'));
      assert.equal((await read()).strictOptions, false);
      await assert.rejects(send(providerChoiceDraft()), {
        code: 'answer-choice-changed',
      });
      assert.deepEqual(await counts(), { clicks: 0, text: 0 });
    }
  );
  await run(
    'explicit choices with hidden controls remain pending',
    async () => {
      await mount();
      await page.locator('[data-qa="chat-bubble-text"]').evaluate((node) => {
        node.textContent = 'Choose one option';
      });
      await page.locator('#choices').evaluate((node) => {
        node.hidden = true;
      });
      const current = await read();
      assert.equal(current.strictOptions, true);
      assert.deepEqual(current.answerOptions, []);
      assert.deepEqual(await counts(), { clicks: 0, text: 0 });
    }
  );
};

const verifyChoiceDispatch = async ({
  run,
  mount,
  read,
  send,
  counts,
  page,
  base,
  before,
}) => {
  await run(
    'an unrelated toolbar does not hide an unscoped yes/no pair',
    async () => {
      await mount();
      await page.locator('#choices').evaluate((node) => {
        node.className = '';
      });
      assert.deepEqual((await read()).answerOptions, ['Yes.', 'No.']);
      assert.equal((await send(providerChoiceDraft())).messageId, '102');
    }
  );
  await run(
    'a changed question between arming and native click blocks dispatch',
    async () => {
      await mount();
      before(() =>
        page.locator('[data-qa="chat-bubble-text"]').evaluate((node) => {
          node.textContent = 'A new question?';
        })
      );
      await assert.rejects(send(providerChoiceDraft()), {
        code: 'answer-choice-changed',
        fallback: false,
      });
      assert.deepEqual(await counts(), { clicks: 0, text: 0 });
      assert.equal(await page.locator('[data-meta-answer-choice]').count(), 0);
    }
  );
  await run(
    'manual navigation cannot redirect a cached conversation selection',
    async () => {
      await read();
      await page.goto(`${base}/chat/8`);
      await mount();
      await assert.rejects(send(providerChoiceDraft()), {
        code: 'answer-choice-changed',
      });
      assert.deepEqual(await counts(), { clicks: 0, text: 0 });
    }
  );
};

const verifyChoiceReceipts = async ({
  run,
  mount,
  page,
  send,
  counts,
  draftValue,
  after,
}) => {
  await run(
    'a missing receipt remains uncertain and cannot be clicked twice',
    async () => {
      await mount();
      await page.evaluate(() => {
        window.fixture.receipt = 'none';
      });
      await assert.rejects(send(providerChoiceDraft()), {
        code: 'send-unknown',
        ambiguous: true,
        fallback: false,
      });
      await assert.rejects(send(providerChoiceDraft()), {
        code: 'send-in-doubt',
      });
      assert.deepEqual(await counts(), { clicks: 1, text: 0 });
    }
  );
  for (const receipt of ['incoming', 'duplicate', 'historical']) {
    await run(
      `${receipt} messages cannot prove a unique outgoing delivery`,
      async () => {
        await mount();
        await page.evaluate((value) => {
          window.fixture.receipt = value;
        }, receipt);
        await assert.rejects(send(providerChoiceDraft()), {
          code: 'send-unknown',
          ambiguous: true,
        });
        assert.deepEqual(await counts(), { clicks: 1, text: 0 });
      }
    );
  }
  await run(
    'delayed readback is awaited and a post-click exception does not erase a receipt',
    async () => {
      await mount();
      await page.evaluate(() => {
        window.fixture.receipt = 'delayed';
      });
      after(() => {
        throw new Error('synthetic post-dispatch failure');
      });
      assert.equal((await send(providerChoiceDraft())).messageId, '102');
      assert.deepEqual(await counts(), { clicks: 1, text: 0 });
    }
  );
  await run(
    'owner input after pointer-down prevents the click and retains uncertainty',
    async () => {
      await mount();
      await page
        .locator('#choices button')
        .first()
        .evaluate((node) =>
          node.addEventListener(
            'pointerdown',
            () => {
              const input = document.querySelector('textarea');
              input.value = 'Owner changed this';
              input.dispatchEvent(new Event('input', { bubbles: true }));
            },
            { once: true }
          )
        );
      await assert.rejects(send(providerChoiceDraft()), {
        code: 'send-unknown',
        ambiguous: true,
      });
      assert.equal(await draftValue(), 'Owner changed this');
      assert.deepEqual(await counts(), { clicks: 0, text: 0 });
    }
  );
};
