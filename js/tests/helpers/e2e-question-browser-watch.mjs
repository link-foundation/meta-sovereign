import { watchFixturePages } from './e2e-page-errors.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { questionBrowserServer } from '../../../experiments/issue-56/question-browser-server.mjs';

/** Production controls and real browser-commander writes; official origins are routed. */
export const verifyQuestionBrowserWatch = async (
  browser,
  { screenshots, before = false } = {}
) => {
  const fixture = await questionBrowserServer(browser);
  const context = await browser.newContext({
    viewport: { width: 1180, height: 950 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  watchFixturePages(context, browser, fixture.base, errors);
  await page.addInitScript(() => {
    globalThis.localStorage.setItem('metaSovereignLocale', 'en');
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      JSON.stringify({ off: true, v: 5 })
    );
  });
  const controls = page.locator(
    '[data-question-controls] [data-browser-answer-controls]'
  );
  const watch = controls.locator('[data-browser-answer-watch]');
  const phase = (value) =>
    watch.locator(
      `[data-browser-watch-state="active"][data-browser-watch-phase="${value}"]`
    );
  const state = (value) =>
    watch.locator(`[data-browser-watch-state="${value}"]`);
  const shot = async (name) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await watch.scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(screenshots, `${name}.png`) });
    }
  };
  const read = async () => {
    const review = controls.locator('[data-browser-answer-review]');
    const previous = await review
      .getAttribute('data-browser-answer-review')
      .catch(() => null);
    await controls.locator('[data-browser-answer-inspect]').click();
    await controls
      .locator(
        previous
          ? `[data-browser-answer-review]:not([data-browser-answer-review="${previous}"])`
          : '[data-browser-answer-review]'
      )
      .waitFor();
  };
  let navigation = 0;
  const open = async () => {
    await page.goto(
      `${fixture.base}/?watch-review=${++navigation}#/automation`
    );
    await page.locator('[data-question-controls] > summary').click();
    await controls.locator(':scope > summary').click();
  };
  const start = () => watch.locator('[data-browser-watch-start]').click();
  const stop = async () => {
    await watch.locator('[data-browser-watch-stop]').click();
    await state('stopped').waitFor();
  };
  let cases = 0;
  const run = async (name, work) => {
    await work();
    cases++;
    console.log(`[question-watch] PASS ${name}`);
  };
  try {
    await open();
    await controls.getByLabel('Web-chat reference', { exact: true }).fill('7');
    await read();
    if (before) {
      assert.equal(await watch.count(), 0);
      if (screenshots) {
        await mkdir(screenshots, { recursive: true });
        await controls.scrollIntoViewIfNeeded();
        await page.screenshot({
          path: join(screenshots, 'before-current-chat-watch.png'),
        });
      }
      return {
        before: true,
        currentChatWatchMissing: true,
        ...(await fixture.stats()),
      };
    }
    const scenario = {
      fixture,
      page,
      controls,
      watch,
      run,
      read,
      start,
      stop,
      phase,
      state,
      shot,
      open,
    };
    await verifyWatchActions(scenario);
    await verifyWatchRecovery(scenario);
    assert.deepEqual(errors, []);
    return { cases, pageErrors: errors, liveProvider: false };
  } catch (error) {
    await shot('failed').catch(() => {});
    throw error;
  } finally {
    await context.close();
    await fixture.close();
  }
};

const verifyWatchActions = async ({
  fixture,
  watch,
  run,
  read,
  start,
  stop,
  phase,
  shot,
}) => {
  await run(
    'disabled options wait, become enabled, and yield one positive native receipt',
    async () => {
      await fixture.page.evaluate(() =>
        window.mountChoices(['Yes', 'No'], true)
      );
      await read();
      await start();
      await phase('pending-options').waitFor();
      assert.equal((await fixture.stats()).clicks, 0);
      await shot('watch-pending-desktop');
      await fixture.page.locator('#choices button').evaluateAll((nodes) =>
        nodes.forEach((node) => {
          node.disabled = false;
        })
      );
      await watch
        .getByText('Provider message receipt: 102', { exact: true })
        .waitFor();
      await shot('watch-receipt-desktop');
      assert.deepEqual(await fixture.stats(), {
        clicks: 1,
        textSends: 0,
        draft: '',
      });
      await stop();
    }
  );
  await run(
    'owned free draft clears when native choices arrive, without a text send',
    async () => {
      await fixture.reset({ freeText: true });
      await read();
      await start();
      await phase('owner-draft').waitFor();
      assert.equal((await fixture.stats()).draft, 'Yes');
      await fixture.page.evaluate(() => window.mountChoices(['Yes', 'No']));
      await watch
        .getByText('Provider message receipt: 102', { exact: true })
        .waitFor();
      assert.deepEqual(await fixture.stats(), {
        clicks: 1,
        textSends: 0,
        draft: '',
      });
      await stop();
    }
  );
  await run(
    'editing the automatic draft preserves owner content when native options arrive',
    async () => {
      await fixture.reset({ freeText: true });
      await read();
      await start();
      await phase('owner-draft').waitFor();
      await fixture.page.locator('textarea').fill('My own revised answer');
      await fixture.page.evaluate(() => window.mountChoices(['Yes', 'No']));
      await watch
        .getByRole('button', { name: 'Recover watcher status', exact: true })
        .click();
      await phase('owner-draft').waitFor();
      await stop();
      assert.deepEqual(await fixture.stats(), {
        clicks: 0,
        textSends: 0,
        draft: 'My own revised answer',
      });
    }
  );
};

const verifyWatchRecovery = async ({
  fixture,
  page,
  controls,
  watch,
  run,
  read,
  start,
  stop,
  phase,
  state,
  shot,
  open,
}) => {
  await run(
    'lost start response recovers the existing request and reload never starts another owner',
    async () => {
      await fixture.reset({ draft: 'Hold this draft' });
      await read();
      await page.route(
        '**/api/automations/answers/browser/watch-start',
        async (route) => {
          await route.fetch();
          await route.abort('failed');
        }
      );
      await start();
      await controls.getByRole('alert').waitFor();
      assert.equal(
        await watch.locator('[data-browser-watch-start]').isDisabled(),
        true
      );
      await page.unroute('**/api/automations/answers/browser/watch-start');
      await watch
        .getByRole('button', { name: 'Recover watcher status', exact: true })
        .click();
      await phase('owner-draft').waitFor();
      await open();
      await phase('owner-draft').waitFor();
      await page.setViewportSize({ width: 390, height: 844 });
      await shot('watch-owner-mobile');
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= globalThis.innerWidth
        ),
        true
      );
      await stop();
      await shot('watch-stopped-mobile');
      assert.deepEqual(await fixture.stats(), {
        clicks: 0,
        textSends: 0,
        draft: 'Hold this draft',
      });
    }
  );
  await run(
    'same-URL reload pauses the original document without reopening it',
    async () => {
      await fixture.reset({ draft: 'Keep the page' });
      await read();
      await start();
      await phase('owner-draft').waitFor();
      await fixture.page.reload();
      await state('paused').waitFor();
      await shot('watch-navigation-paused-mobile');
      assert.equal((await fixture.stats()).clicks, 0);
      await stop();
    }
  );
};
