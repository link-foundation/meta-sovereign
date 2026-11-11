/* global history */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { makeBrowserCommander } from 'browser-commander';
import { createBrowserSender } from '../../src/sources/browser-sender.js';
import {
  hhChoiceHtml,
  hhApplicationHtml,
} from '../../../experiments/issue-56/hh-choice-fixture.mjs';
import { providerChoiceDraft } from '../../../experiments/issue-56/provider-choice-fixture.mjs';

/** Bounded native HH main/cross-origin/nested frame regressions with no network. */
export const verifyHhChoices = async (browser, { screenshots } = {}) => {
  const context = await browser.newContext({
    viewport: { width: 1050, height: 900 },
  });
  let application = hhApplicationHtml();
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return route.fulfill({
      contentType: 'text/html',
      body: url.pathname.startsWith('/chat/')
        ? hhChoiceHtml
        : url.pathname === '/frame-host'
          ? hhApplicationHtml()
          : url.pathname === '/empty'
            ? '<!doctype html><title>Empty fixture</title>'
            : application,
    });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const commander = makeBrowserCommander({
    page,
    enableNetworkTracking: false,
    enableNavigationManager: false,
    enableDialogManager: false,
  });
  const sender = createBrowserSender({
    pollMs: 10,
    loginTimeoutMs: 300,
    choiceReceiptMs: 100,
    openSession: async () => ({
      commander,
      page,
      close: () => context.close(),
    }),
  });
  const args = { source: 'hh', chat: '7' };
  const appArgs = { ...args, browserUrl: 'https://hh.ru/vacancy/42' };
  const frame = () =>
    page
      .frames()
      .find((value) => value.url() === 'https://chatik.hh.ru/chat/7');
  const mount = (target = page, labels = ['Yes.', 'No.']) =>
    target.evaluate((options) => window.mountChoices(options), labels);
  const counters = (target = page) =>
    target.evaluate(() => ({
      clicks: window.fixture.clicks,
      text: window.fixture.textSends,
    }));
  const screenshot = async (name) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await page.screenshot({
        path: join(screenshots, `hh-choices-${name}.png`),
        fullPage: true,
      });
    }
  };
  let cases = 0;
  const run = async (name, verify) => {
    await verify();
    cases++;
    console.log(`[hh-choices] PASS ${name}`);
  };
  const openApp = async (markup = hhApplicationHtml()) => {
    application = markup;
    await page.goto(appArgs.browserUrl);
    await page.locator('iframe').first().waitFor({ state: 'attached' });
    await frame()?.waitForLoadState();
    await sender.readAnswerChoices(appArgs).catch((error) => {
      if (error.code !== 'answer-chat-unverified') {
        throw error;
      }
    });
  };
  try {
    // Capture the actual pre-adapter view when the parent has no built-in HH.
    await page.goto('https://hh.ru/chat/7');
    await mount();
    await screenshot('before');
    await run(
      'built-in main chat history retains strict controls and native receipt',
      async () => {
        await sender.readRecent(args);
        await mount();
        const rows = await sender.readRecent(args);
        assert.equal(rows.at(-1).strictOptions, true);
        assert.deepEqual(rows.at(-1).answerOptions, ['Yes.', 'No.']);
        assert.equal(rows.at(-1).id, 'msg:hh:7:101');
        const result = await sender.chooseAnswer(providerChoiceDraft());
        assert.equal(result.messageId, '102');
        assert.equal((await sender.readRecent(args)).at(-1).outgoing, true);
        assert.deepEqual(await counters(), { clicks: 1, text: 0 });
        await screenshot('main-after');
      }
    );
    await run(
      'cross-origin application frame owns delayed drafts and exact receipt',
      async () => {
        await openApp();
        // Prime the sender URL before working in the newly opened application.
        const expected = await sender.readAnswerChoices(appArgs);
        await sender.prefillAnswer({
          ...appArgs,
          expected,
          text: 'Owned automatic draft',
        });
        assert.equal(
          await frame().locator('textarea').inputValue(),
          'Owned automatic draft'
        );
        await mount(frame());
        const choices = await sender.readAnswerChoices(appArgs);
        assert.equal(choices.hasDraft, false);
        assert.equal(await frame().locator('textarea').inputValue(), '');
        await screenshot('frame-ready');
        assert.equal(
          (
            await sender.chooseAnswer({
              ...providerChoiceDraft(),
              browserUrl: appArgs.browserUrl,
            })
          ).messageId,
          '102'
        );
        assert.deepEqual(await counters(frame()), { clicks: 1, text: 0 });
        await screenshot('frame-after');
      }
    );
    const fixture = {
      run,
      page,
      sender,
      args,
      appArgs,
      frame,
      mount,
      counters,
      screenshot,
      openApp,
    };
    await verifyFrameSelection(fixture);
    await verifyFrameRaces(fixture);
    assert.deepEqual(errors, []);
    return { cases, pageErrors: errors, liveProvider: false };
  } finally {
    await sender.close();
    await context.close();
  }
};

const verifyFrameSelection = async ({
  run,
  page,
  sender,
  args,
  appArgs,
  frame,
  mount,
  counters,
  screenshot,
  openApp,
}) => {
  await run(
    'nested trusted application frame resolves through its visible ancestor',
    async () => {
      await openApp(
        hhApplicationHtml(
          '<iframe src="https://chatik.hh.ru/frame-host"></iframe>'
        )
      );
      await mount(frame());
      assert.equal(
        (await sender.readAnswerChoices(appArgs)).strictOptions,
        true
      );
    }
  );
  await run(
    'untrusted nested ancestor cannot lend authority to its official child',
    async () => {
      await openApp(
        hhApplicationHtml(
          '<iframe src="https://untrusted.example.test/frame-host"></iframe>'
        )
      );
      await assert.rejects(sender.readAnswerChoices(appArgs), {
        code: 'answer-chat-unverified',
      });
    }
  );
  await run('frame enumeration is bounded before reading history', async () => {
    await openApp(
      hhApplicationHtml(
        `<iframe src="https://chatik.hh.ru/chat/7"></iframe>${'<iframe src="https://chatik.hh.ru/empty"></iframe>'.repeat(32)}`
      )
    );
    await assert.rejects(sender.readAnswerChoices(appArgs), {
      code: 'answer-chat-unverified',
    });
  });
  await run('one hidden duplicate cannot steal the current frame', async () => {
    await openApp(
      hhApplicationHtml(
        '<iframe style="display:none" src="https://chatik.hh.ru/chat/7?hidden"></iframe><iframe src="https://chatik.hh.ru/chat/7"></iframe>'
      )
    );
    await mount(frame());
    assert.equal((await sender.readAnswerChoices(appArgs)).strictOptions, true);
  });
  await run('two visible same-chat frames are ambiguous', async () => {
    await openApp(
      hhApplicationHtml(
        '<iframe src="https://chatik.hh.ru/chat/7"></iframe><iframe src="https://chatik.hh.ru/chat/7?duplicate"></iframe>'
      )
    );
    await assert.rejects(sender.readAnswerChoices(appArgs), {
      code: 'answer-chat-unverified',
    });
  });
  await run(
    'untrusted outer page cannot lend authority to an official child',
    async () => {
      await openApp();
      await sender.readAnswerChoices(appArgs);
      await page.goto('https://untrusted.example.test/vacancy/42');
      await assert.rejects(sender.readAnswerChoices(appArgs), {
        code: 'answer-chat-unverified',
      });
    }
  );
  await run('wrong conversation and hidden ancestor are refused', async () => {
    for (const markup of [
      hhApplicationHtml('<iframe src="https://chatik.hh.ru/chat/8"></iframe>'),
      hhApplicationHtml(
        '<div hidden><iframe src="https://chatik.hh.ru/chat/7"></iframe></div>'
      ),
    ]) {
      // Hidden iframe intentionally cannot satisfy a visible locator wait.
      await openApp(markup);
      await assert.rejects(sender.readAnswerChoices(appArgs), {
        code: 'answer-chat-unverified',
      });
    }
  });
  await run('owner composer survives native selection refusal', async () => {
    await openApp();
    await mount(frame());
    await frame().locator('textarea').fill('Owner draft');
    await assert.rejects(
      sender.chooseAnswer({
        ...providerChoiceDraft(),
        browserUrl: appArgs.browserUrl,
      }),
      { code: 'answer-draft-preserved' }
    );
    assert.equal(await frame().locator('textarea').inputValue(), 'Owner draft');
    assert.deepEqual(await counters(frame()), { clicks: 0, text: 0 });
    await screenshot('owner-draft');
  });
  await run(
    'attached nonbinary choices and disabled options remain strict',
    async () => {
      await openApp();
      await mount(frame(), ['Remote', 'Office']);
      await frame().evaluate(() => {
        const group = document.querySelector('#choices');
        group.className = '';
        document.querySelector('article').append(group);
      });
      assert.deepEqual(
        (await sender.readAnswerChoices(appArgs)).answerOptions,
        ['Remote', 'Office']
      );
      await frame()
        .locator('#choices button')
        .evaluateAll((nodes) =>
          nodes.forEach((node) => {
            node.disabled = true;
          })
        );
      const current = await sender.readAnswerChoices(appArgs);
      assert.equal(current.strictOptions, true);
      assert.deepEqual(current.answerOptions, []);
    }
  );
  await verifyGenericSuggestions({
    run,
    page,
    args,
    sender,
    appArgs,
    frame,
    mount,
    openApp,
  });
};

const verifyFrameRaces = async ({
  run,
  page,
  sender,
  appArgs,
  frame,
  mount,
  counters,
  openApp,
}) => {
  await verifyLostAuthority({
    run,
    page,
    appArgs,
    frame,
    mount,
    counters,
    openApp,
  });
  await run(
    'changed question at native pointer dispatch blocks the click',
    async () => {
      await openApp();
      await mount(frame());
      await frame().evaluate(() =>
        document.addEventListener(
          'pointerdown',
          () => {
            window.fixture.pointerChanged = true;
            document.querySelector('[data-qa="chat-bubble-text"]').textContent =
              'A different question?';
          },
          { capture: true, once: true }
        )
      );
      await assert.rejects(
        sender.chooseAnswer({
          ...providerChoiceDraft(),
          browserUrl: appArgs.browserUrl,
        }),
        { code: 'answer-choice-changed', fallback: false }
      );
      assert.equal(
        await frame().evaluate(() => window.fixture.pointerChanged),
        true
      );
      assert.deepEqual(await counters(frame()), { clicks: 0, text: 0 });
      assert.equal(
        await frame().locator('[data-meta-answer-choice]').count(),
        0
      );
    }
  );
  await run(
    'missing receipt is unknown and retry cannot issue a second click',
    async () => {
      await openApp();
      await mount(frame());
      await frame().evaluate(() => {
        window.fixture.receipt = 'none';
      });
      const draft = {
        ...providerChoiceDraft(),
        browserUrl: appArgs.browserUrl,
      };
      await assert.rejects(sender.chooseAnswer(draft), {
        code: 'send-unknown',
        fallback: false,
      });
      await assert.rejects(sender.chooseAnswer(draft), {
        code: 'send-in-doubt',
        fallback: false,
      });
      assert.deepEqual(await counters(frame()), { clicks: 1, text: 0 });
      assert.equal(
        await frame().locator('[data-meta-answer-choice]').count(),
        0
      );
    }
  );
  await run(
    'document replacement and new same-chat frame invalidate a held executor',
    async () => {
      const { resolveBrowserChoiceDocument } =
        await import('../../src/sources/browser-choice-document.js');
      const { WEB_UIS } = await import('../../src/sources/web-uis.js');
      for (const change of ['reload', 'duplicate', 'owner']) {
        await openApp();
        const document = await resolveBrowserChoiceDocument(
          {},
          page,
          WEB_UIS.hh,
          '7'
        );
        if (change === 'reload') {
          await frame().goto(frame().url());
        } else if (change === 'duplicate') {
          await page.evaluate(() => {
            const node = document.createElement('iframe');
            node.src = 'https://chatik.hh.ru/chat/7?late';
            document.body.append(node);
          });
          await page
            .frames()
            .at(-1)
            .waitForURL('https://chatik.hh.ru/chat/7?late');
        } else {
          await page.evaluate(() =>
            history.replaceState(null, '', '/vacancy/43')
          );
        }
        await assert.rejects(
          document.evaluate({ fn: () => 'should not run', args: [] }),
          { code: 'answer-chat-unverified' }
        );
      }
    }
  );
};

const verifyLostAuthority = async ({
  run,
  page,
  frame,
  mount,
  counters,
  openApp,
}) => {
  await run(
    'lost owner authority after arming cleans hooks and preserves uncertainty',
    async () => {
      const { resolveBrowserChoiceDocument } =
        await import('../../src/sources/browser-choice-document.js');
      const { selectBrowserAnswer } =
        await import('../../src/sources/browser-choices.js');
      const { WEB_UIS } = await import('../../src/sources/web-uis.js');
      await openApp();
      await mount(frame());
      const held = await resolveBrowserChoiceDocument(
        {},
        page,
        WEB_UIS.hh,
        '7'
      );
      const proxy = {
        ...held,
        async evaluate(input) {
          const result = await held.evaluate(input);
          if (input.args[0]?.operation === 'arm') {
            await page.evaluate(() =>
              history.replaceState(null, '', '/vacancy/43')
            );
          }
          return result;
        },
      };
      await assert.rejects(
        selectBrowserAnswer(proxy, WEB_UIS.hh, providerChoiceDraft(), '7', {
          receiptMs: 0,
        }),
        { code: 'send-unknown', fallback: false }
      );
      assert.deepEqual(await counters(frame()), { clicks: 0, text: 0 });
      assert.equal(
        await frame().locator('[data-meta-answer-choice]').count(),
        0
      );
      const current = await resolveBrowserChoiceDocument(
        {},
        page,
        WEB_UIS.hh,
        '7'
      );
      await assert.rejects(
        selectBrowserAnswer(current, WEB_UIS.hh, providerChoiceDraft(), '7'),
        { code: 'send-in-doubt', fallback: false }
      );
    }
  );
};

const verifyGenericSuggestions = async ({
  run,
  page,
  args,
  sender,
  appArgs,
  frame,
  mount,
  openApp,
}) => {
  await run(
    'generic greeting wrapper stays distinct from a real answer group',
    async () => {
      await openApp();
      await frame().evaluate(() => {
        document.querySelector('#starters').className = 'buttons-wrapper';
      });
      assert.equal(
        (await sender.readAnswerChoices(appArgs)).strictOptions,
        false
      );
      await mount(frame());
      const current = await sender.readAnswerChoices(appArgs);
      assert.equal(current.strictOptions, true);
      assert.deepEqual(current.answerOptions, ['Yes.', 'No.']);
      await frame().evaluate(() => {
        document
          .querySelector('#starters')
          .append(...document.querySelector('#choices').children);
        document.querySelector('#choices').className = '';
      });
      assert.deepEqual(
        (await sender.readAnswerChoices(appArgs)).answerOptions,
        ['Yes.', 'No.']
      );
    }
  );
  await run(
    'manual top-level conversation navigation never redirects back',
    async () => {
      await page.goto('https://hh.ru/chat/7');
      await sender.readAnswerChoices(args);
      await page.goto('https://hh.ru/chat/8');
      await assert.rejects(sender.readAnswerChoices(args), {
        code: 'answer-chat-unverified',
      });
      assert.equal(page.url(), 'https://hh.ru/chat/8');
    }
  );
};
