import assert from 'node:assert/strict';

export const verifyCvTranslationComparison = async ({
  run,
  translators,
  page,
  panel,
  text,
  action,
  result,
  pendingKey,
  compare,
  screenshot,
}) => {
  await run(
    'explicit admission validates before persisting intent and compares all selected providers',
    async () => {
      assert.equal(translators.calls.translate.length, 0);
      assert.equal(await action('generate').isDisabled(), true);
      await text.fill(translators.input.texts[0]);
      const model = panel.locator('[data-cv-translation-model="haiku"]');
      await model.fill('sonnet');
      await action('generate').click();
      await page.locator('[data-vacancy-error]').waitFor();
      assert.equal(
        await page.evaluate(
          (key) => globalThis.localStorage.getItem(key),
          pendingKey
        ),
        null
      );
      assert.equal(translators.calls.translate.length, 0);
      await model.fill('');
      await compare();
      assert.equal(
        await panel.locator('[data-cv-translation-variant]').count(),
        3
      );
      assert.match(await panel.textContent(), /claude-haiku-5-5|gpt-6-luna/u);
      assert.match(await panel.textContent(), /placeholder/u);
      assert.match(
        await panel.textContent(),
        /No provider fields have been prepared or saved/u
      );
      assert.equal(translators.calls.translate.length, 3);
      await screenshot('cv-translation-desktop');
    }
  );
  await run(
    'new explicit comparison reuses only valid model-version cache entries; GET does no work',
    async () => {
      await compare();
      assert.equal(translators.calls.translate.length, 4);
      const id = await result.getAttribute('data-cv-translation-request');
      await action('reload').click();
      await result.waitFor();
      assert.equal(
        await result.getAttribute('data-cv-translation-request'),
        id
      );
      assert.equal(translators.calls.translate.length, 4);
      assert.equal(
        await panel
          .getByText('Cached for this model/version', { exact: true })
          .count(),
        2
      );
    }
  );
  await run(
    'failed provider preserves alternatives and source text is never a fallback translation',
    async () => {
      translators.modes.fail = 'haiku';
      await text.fill('Руководил разработкой программного обеспечения.');
      await compare();
      assert.match(await panel.textContent(), /Preferred variant: Luna/u);
      assert.match(
        await panel
          .locator('[data-cv-translation-variant="haiku"]')
          .textContent(),
        /unavailable/u
      );
      assert.equal(
        (await panel.textContent()).includes('private-fixture-detail'),
        false
      );
      translators.modes.fail = '';
    }
  );
};
