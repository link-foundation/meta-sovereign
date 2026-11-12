import assert from 'node:assert/strict';
import { wirePost } from './vacancy-routes.mjs';
import { decodeWire, LINO_TEXT } from '../../src/transport/lino.js';

export const verifyCvTranslationRecovery = async ({
  run,
  translators,
  f,
  page,
  panel,
  text,
  action,
  result,
  pendingKey,
  screenshot,
}) => {
  await run(
    'lost reply recovers exact comparison on phone through GET without another model call',
    async () => {
      let posts = 0;
      await page.route('**/api/vacancies/cv-translate', async (route) => {
        posts++;
        await route.fetch();
        await route.abort('failed');
      });
      await text.fill('Проверял программное обеспечение и качество.');
      await action('generate').click();
      await page.locator('[data-vacancy-error]').waitFor();
      const count = translators.calls.translate.length;
      const pending = await page.evaluate(
        (key) => globalThis.localStorage.getItem(key),
        pendingKey
      );
      assert(pending);
      await page.unroute('**/api/vacancies/cv-translate');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload();
      await panel.locator('[data-cv-translation-result="completed"]').waitFor();
      assert.equal(
        await result.getAttribute('data-cv-translation-request'),
        pending
      );
      await action('reload').click();
      assert.equal(translators.calls.translate.length, count);
      assert.equal(posts, 1);
      assert.equal(
        await page.evaluate(
          (key) => globalThis.localStorage.getItem(key),
          pendingKey
        ),
        null
      );
      const geometry = await panel.evaluate((node) => ({
        width: node.clientWidth,
        scroll: node.scrollWidth,
      }));
      assert(geometry.scroll <= geometry.width + 1, JSON.stringify(geometry));
      await screenshot('cv-translation-phone');
    }
  );
  await run(
    'unreceived request survives GET-null and reload until durable cancellation blocks its late copy',
    async () => {
      let original;
      await page.route('**/api/vacancies/cv-translate', async (route) => {
        original = decodeWire(
          route.request().postDataBuffer(),
          route.request().headers()['content-type']
        );
        await route.abort('failed');
      });
      await text.fill('Создавал приложения для команды.');
      await action('generate').click();
      await page.locator('[data-vacancy-error]').waitFor();
      const count = translators.calls.translate.length;
      await page.unroute('**/api/vacancies/cv-translate');
      await action('reload').click();
      await page.reload();
      await panel.waitFor();
      assert.equal(await action('generate').isDisabled(), true);
      await action('cancel').click();
      await action('cancel').waitFor({ state: 'detached' });
      const late = await wirePost(f.base, 'cv-translate', original, LINO_TEXT, {
        origin: f.base,
      });
      assert.equal(late.status, 200);
      assert.equal(late.value.cancelled.requestId, original.requestId);
      assert.equal(translators.calls.translate.length, count);
    }
  );
  await run(
    'Stop drains the admitted translator and reload preserves stopped state without replay',
    async () => {
      translators.modes.wait = true;
      await text.fill('Разрабатывал системы для пользователей.');
      const called = translators.calls.translate.length;
      await action('generate').click();
      const deadline = Date.now() + 5000;
      while (
        translators.calls.translate.length === called &&
        Date.now() < deadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal(translators.calls.translate.length, called + 1);
      await page.reload();
      await panel.locator('[data-cv-translation-result="running"]').waitFor();
      await action('stop').click();
      await panel.locator('[data-cv-translation-result="stopped"]').waitFor();
      assert.equal(translators.calls.drained, 1);
      await page.reload();
      await panel.locator('[data-cv-translation-result="stopped"]').waitFor();
      assert.equal(translators.calls.translate.length, called + 1);
      translators.modes.wait = false;
    }
  );
};
