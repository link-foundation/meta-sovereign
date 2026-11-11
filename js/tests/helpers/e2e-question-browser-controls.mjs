import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { questionBrowserServer } from '../../../experiments/issue-56/question-browser-server.mjs';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../src/web/tutorial.js';

const verifyCurrentReview = async ({
  fixture,
  controls,
  run,
  inspect,
  readCurrent,
  status,
  shot,
  open,
}) => {
  await run(
    'current question, exact saved option and native provider receipt',
    async () => {
      await inspect();
      await controls.getByRole('radio', { name: 'Yes', exact: true }).check();
      await controls.scrollIntoViewIfNeeded();
      await shot('review-desktop');
      await controls.locator('[data-browser-answer-select]').click();
      await status('sent').waitFor();
      assert.deepEqual(await fixture.stats(), {
        clicks: 1,
        textSends: 0,
        draft: '',
      });
      await controls
        .getByText('Provider message receipt: 102', { exact: true })
        .waitFor();
      await shot('sent-desktop');
    }
  );
  await run('reload restores receipt without replay', async () => {
    await open();
    await controls.locator(':scope > summary').click();
    await status('sent').waitFor();
    assert.equal(await fixture.stats().then((s) => s.clicks), 1);
    assert.equal(
      await controls.locator('[data-browser-answer-select]').isDisabled(),
      true
    );
  });
  await run('owner draft blocks native selection', async () => {
    await fixture.reset({ draft: 'Keep my own answer' });
    await readCurrent();
    await status('review').waitFor();
    await controls
      .getByText(
        'The provider input contains a draft. Review it there before selecting an option.',
        { exact: true }
      )
      .waitFor();
    assert.equal(
      await controls.locator('[data-browser-answer-select]').isDisabled(),
      true
    );
    assert.equal((await fixture.stats()).draft, 'Keep my own answer');
    await shot('owner-draft');
  });
  await run('a changed question refuses before the native click', async () => {
    await fixture.reset();
    await readCurrent();
    await status('review').waitFor();
    await fixture.page
      .locator('[data-qa="chat-bubble-text"]')
      .evaluate((element) => {
        element.textContent += ' Updated?';
      });
    await controls.locator('[data-browser-answer-select]').click();
    await status('failed').waitFor();
    assert.equal((await fixture.stats()).clicks, 0);
  });
};

const verifyRecovery = async ({
  fixture,
  page,
  controls,
  run,
  readCurrent,
  status,
  shot,
  open,
}) => {
  await run(
    'lost HTTP response blocks selection until read-only recovery',
    async () => {
      await fixture.reset();
      await readCurrent();
      await status('review').waitFor();
      await page.route(
        '**/api/automations/answers/browser/select',
        async (route) => {
          await route.fetch();
          await route.abort('failed');
        }
      );
      await controls.locator('[data-browser-answer-select]').click();
      await controls.getByRole('alert').waitFor();
      assert.equal(
        await controls.locator('[data-browser-answer-select]').isDisabled(),
        true
      );
      assert.equal((await fixture.stats()).clicks, 1);
      await page.unroute('**/api/automations/answers/browser/select');
      await controls
        .getByRole('button', {
          name: 'Recover selection status',
          exact: true,
        })
        .click();
      await status('sent').waitFor();
      assert.equal((await fixture.stats()).clicks, 1);
      await shot('lost-response-recovered');
    }
  );
  await run(
    'missing provider receipt stays unknown across reload',
    async () => {
      await fixture.reset({ receipt: 'none' });
      await readCurrent();
      await status('review').waitFor();
      await controls.locator('[data-browser-answer-select]').click();
      await status('unknown').waitFor();
      assert.equal((await fixture.stats()).clicks, 1);
      await open();
      await controls.locator(':scope > summary').click();
      await status('unknown').waitFor();
      assert.equal(
        await controls.locator('[data-browser-answer-select]').isDisabled(),
        true
      );
      await shot('unknown-recovered');
      assert.equal((await fixture.stats()).clicks, 1);
    }
  );
  await run(
    'mobile review fits viewport and keeps exact option confirmation',
    async () => {
      await fixture.reset();
      await page.setViewportSize({ width: 390, height: 844 });
      await controls
        .getByLabel('Web-chat reference', { exact: true })
        .fill('7');
      await readCurrent();
      await status('review').waitFor();
      await controls.scrollIntoViewIfNeeded();
      await shot('review-mobile');
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= globalThis.innerWidth
        ),
        true
      );
      await controls.locator('[data-browser-answer-select]').click();
      await status('sent').waitFor();
      await controls.scrollIntoViewIfNeeded();
      await shot('sent-mobile');
      assert.equal((await fixture.stats()).clicks, 1);
    }
  );
};

const verifySurfaces = async ({
  fixture,
  page,
  controls: initialControls,
  setControls,
  run,
  readCurrent,
  status,
  shot,
}) => {
  let controls = initialControls;
  await run(
    'free-text prefill reads back the draft without sending',
    async () => {
      await fixture.reset({ freeText: true });
      await readCurrent();
      await controls
        .getByRole('button', {
          name: 'Prefill the reviewed draft',
          exact: true,
        })
        .click();
      await controls
        .getByRole('button', {
          name: 'Draft prefilled; review it in the provider chat',
          exact: true,
        })
        .waitFor();
      assert.deepEqual(await fixture.stats(), {
        clicks: 0,
        textSends: 0,
        draft: 'Yes',
      });
      await shot('prefilled-mobile');
    }
  );
  for (const [surface, hash] of [
    ['chat', '#chat=hh:7'],
    ['operator', '#/operator?chat=hh%3A7'],
  ]) {
    await run(
      `${surface} shares the current native question review`,
      async () => {
        await fixture.reset();
        await page.setViewportSize({ width: 1180, height: 950 });
        await page.goto(`${fixture.base}/?browser-review=${surface}${hash}`);
        await page.locator('[data-action="chat-automations"]').click();
        controls = page.locator(
          '.chat-menu-list [data-browser-answer-controls]'
        );
        setControls(controls);
        await controls.locator(':scope > summary').click();
        await controls
          .getByLabel('Web-chat reference', { exact: true })
          .waitFor();
        // Chat and Operator share a per-chat recovery key. A fresh inspection
        // must replace that recovered review before interacting with the provider.
        await readCurrent();
        await controls.getByRole('radio', { name: 'Yes', exact: true }).check();
        await controls.scrollIntoViewIfNeeded();
        await shot(`review-${surface}`);
        await controls.locator('[data-browser-answer-select]').click();
        await status('sent').waitFor();
        assert.equal((await fixture.stats()).clicks, 1);
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= globalThis.innerWidth
          ),
          true
        );
      }
    );
  }
};

export const verifyQuestionBrowserControls = async (
  browser,
  { screenshots, before = false } = {}
) => {
  const fixture = await questionBrowserServer(browser);
  const context = await browser.newContext({
    viewport: { width: 1180, height: 950 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(
    ({ key, version }) => {
      globalThis.localStorage.setItem(
        key,
        JSON.stringify({ off: true, v: version })
      );
      globalThis.localStorage.setItem('metaSovereignLocale', 'en');
      globalThis.localStorage.setItem(
        'metaSovereignOperatorScope',
        JSON.stringify({
          private: true,
          bot: true,
          group: false,
          channel: false,
        })
      );
    },
    { key: TUTORIAL_STORAGE_KEY, version: TUTORIAL_VERSION }
  );
  const panel = page.locator('[data-question-controls]');
  let controls = panel.locator('[data-browser-answer-controls]');
  const shot = async (name) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await page.screenshot({ path: join(screenshots, `${name}.png`) });
    }
  };
  let navigation = 0;
  const open = async () => {
    navigation++;
    await page.goto(
      `${fixture.base}/?browser-review=${navigation}#/automation`
    );
    await panel.locator(':scope > summary').click();
  };
  const readCurrent = async () => {
    const review = controls.locator('[data-browser-answer-review]');
    const previous = (await review.count())
      ? await review.getAttribute('data-browser-answer-review')
      : null;
    await controls.locator('[data-browser-answer-inspect]').click();
    await controls
      .locator(
        previous
          ? `[data-browser-answer-review]:not([data-browser-answer-review="${previous}"])`
          : '[data-browser-answer-review]'
      )
      .waitFor();
  };
  const inspect = async () => {
    await controls.locator(':scope > summary').click();
    await controls.getByLabel('Web-chat reference', { exact: true }).fill('7');
    await readCurrent();
  };
  const status = (value) =>
    controls.locator(`[data-browser-answer-status="${value}"]`);
  let cases = 0;
  const run = async (name, work) => {
    await work();
    cases++;
    console.log(`[question-browser] PASS ${name}`);
  };
  try {
    await open();
    if (before) {
      await shot('before-shared-controls');
      assert.equal(await controls.count(), 0);
      const response = await page.request.get(
        `${fixture.base}/api/automations/answers/browser`
      );
      assert.equal(response.status(), 404);
      return { before: true, missingControls: true, missingRoute: true };
    }
    const scenario = {
      fixture,
      page,
      controls,
      run,
      inspect,
      readCurrent,
      status,
      shot,
      open,
      setControls: (value) => {
        controls = value;
      },
    };
    await verifyCurrentReview(scenario);
    await verifyRecovery(scenario);
    await verifySurfaces(scenario);
    assert.deepEqual(errors, []);
    return { cases, pageErrors: errors, liveProvider: false };
  } catch (error) {
    await shot('failed');
    throw error;
  } finally {
    await context.close();
    await fixture.close();
  }
};
