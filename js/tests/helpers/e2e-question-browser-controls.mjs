import assert from 'node:assert/strict';
import { questionBrowserUi } from './question-browser-ui.mjs';
import { verifyBrowserPendingTurn } from './e2e-browser-pending-turn.mjs';
import { verifyQuestionPendingPlan } from './e2e-question-pending-plan.mjs';

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
  {
    screenshots,
    before = false,
    pendingOnly = false,
    wholeTurnOnly = false,
  } = {}
) => {
  const scenario = await questionBrowserUi(browser, { screenshots });
  const { fixture, page, controls, shot, open, readCurrent } = scenario;
  try {
    await open();
    if (before && !pendingOnly && !wholeTurnOnly) {
      await shot('before-shared-controls');
      assert.equal(await controls.count(), 0);
      const response = await page.request.get(
        `${fixture.base}/api/automations/answers/browser`
      );
      assert.equal(response.status(), 404);
      return { before: true, missingControls: true, missingRoute: true };
    }
    if (pendingOnly || wholeTurnOnly) {
      await (
        wholeTurnOnly ? verifyQuestionPendingPlan : verifyBrowserPendingTurn
      )(scenario, { before });
      return { ...scenario.result(), before };
    }
    await verifyCurrentReview(scenario);
    await verifyBrowserPendingTurn({ ...scenario, inspect: readCurrent });
    await verifyQuestionPendingPlan({ ...scenario, inspect: readCurrent });
    await verifyRecovery(scenario);
    await verifySurfaces(scenario);
    return scenario.result();
  } catch (error) {
    await shot('failed');
    throw error;
  } finally {
    await scenario.close();
  }
};
