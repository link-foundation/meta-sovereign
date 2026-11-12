import assert from 'node:assert/strict';

export const verifyCvPreparationRecovery = async ({
  run,
  f,
  prepare,
  page,
  panel,
  reload,
  status,
  shot,
}) => {
  const { provider } = f;
  await run(
    'focus leaving About stops native keyboard preparation without typing into another field',
    async () => {
      await f.open({ stealFocus: true });
      await clickCvPreparation(page, prepare, 'uncertain');
      assert.equal(
        await provider.locator('[aria-label="Header search"]').inputValue(),
        ''
      );
      assert.equal(await provider.evaluate(() => globalThis.fixtureSaves), 0);
      assert.match(await panel.textContent(), /jobs-cv-draft/u);
    }
  );
  await run(
    'lost POST reply survives phone reload and only GET recovers the exact durable request',
    async () => {
      await f.open();
      let posts = 0;
      await page.route('**/api/vacancies/cv-prepare', async (route) => {
        posts++;
        await route.fetch();
        await route.abort('failed');
      });
      await prepare.click();
      await page.locator('[data-vacancy-error]').waitFor();
      assert.equal(await prepare.isDisabled(), true);
      await page.unroute('**/api/vacancies/cv-prepare');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload();
      await status('prepared');
      await reload.focus();
      await page.keyboard.press('Enter');
      await status('prepared');
      assert.equal(posts, 1);
      assert.equal(await provider.evaluate(() => globalThis.fixtureOpeners), 1);
      const geometry = await panel.evaluate((node) => ({
        width: node.clientWidth,
        scroll: node.scrollWidth,
      }));
      assert.ok(geometry.scroll <= geometry.width + 1);
      await panel.scrollIntoViewIfNeeded();
      await shot('cv-prepare-phone');
    }
  );
  await run(
    'the owner can revise the prepared draft and Save observation verifies the final native text',
    async () => {
      const watch = page.locator('[data-cv-save-watch]');
      await watch.locator('[data-cv-watch-action="start"]').click();
      await watch.locator('[data-cv-watch-state="watching"]').waitFor();
      const final =
        'Final owner revision after reviewing the prepared About draft';
      await provider.locator('textarea').fill(final);
      await provider.locator('[data-qa="resume-partial-edit-save"]').click();
      await watch.locator('[data-cv-watch-state="saved"]').waitFor();
      const snapshots = await f.store.get('jobs-cv-snapshots:jobs');
      assert.equal(
        snapshots.snapshots.find((row) => row.hash === f.change.hash).cv.about,
        final
      );
      await watch.locator('[data-cv-watch-action="stop"]').click();
      await watch.locator('[data-cv-watch-state="stopped"]').waitFor();
      assert.equal(await provider.evaluate(() => globalThis.fixtureSaves), 1);
      assert.equal(provider.isClosed(), false);
      await shot('cv-prepare-owner-save', provider);
    }
  );
  await run(
    'an unreceived request remains blocked after GET-null and page reload without a replacement POST',
    async () => {
      let posts = 0;
      await page.route('**/api/vacancies/cv-prepare', async (route) => {
        posts++;
        await route.abort('failed');
      });
      await prepare.click();
      await page.locator('[data-vacancy-error]').waitFor();
      await page.unroute('**/api/vacancies/cv-prepare');
      await reload.click();
      await page.waitForFunction(
        () => !document.querySelector('[data-cv-preparation-state]')
      );
      assert.equal(await prepare.isDisabled(), true);
      await page.reload();
      await panel.waitFor();
      await page.waitForFunction(
        () =>
          document.querySelector('[data-cv-prepare-reload]')?.disabled === false
      );
      assert.equal(await prepare.isDisabled(), true);
      assert.equal(posts, 1);
    }
  );
};

export const clickCvPreparation = async (page, button, state) => {
  const old = await page
    .locator('[data-cv-preparation-state]')
    .evaluateAll(
      (nodes) => nodes[0]?.getAttribute('data-cv-preparation-request') ?? null
    );
  await button.click();
  await page.waitForFunction(
    ({ old, state }) => {
      const result = document.querySelector('[data-cv-preparation-state]');
      return (
        result?.getAttribute('data-cv-preparation-state') === state &&
        result.getAttribute('data-cv-preparation-request') !== old
      );
    },
    { old, state }
  );
};
