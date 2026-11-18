import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { LINO_TEXT, decodeWire } from '../../src/transport/lino.js';

/** Recover the same real native delivery through the saved-description UI. */
export const verifySavedVacancyApplication = async (
  fixture,
  { screenshots, before = false } = {}
) => {
  const { page, base } = fixture;
  const response = await page.request.get(`${base}/api/vacancies/stored`, {
    headers: { accept: LINO_TEXT },
  });
  assert.equal(response.status(), 200);
  const entries = decodeWire(
    await response.body(),
    response.headers()['content-type']
  ).entries;
  assert.equal(entries.length, 1);
  const entry = entries[0];
  assert.equal(entry.status === 'applied', !before);
  if (!before) {
    assert.ok(Number.isFinite(Date.parse(entry.appliedAt)));
  }
  const snapshot = page.locator('[data-vacancy-snapshot]');
  const select = async () => {
    await page.locator(`[data-vacancy-action="${entry.id}"]`).click();
    await snapshot.waitFor();
    assert.equal(
      await snapshot.locator('[data-vacancy-applied]').count(),
      before ? 0 : 1
    );
  };
  const shot = async (name) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await snapshot.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: join(screenshots, `applied-cache-${name}.png`),
      });
    }
  };
  await page.reload();
  await select();
  await shot(before ? 'before' : 'after');
  if (!before) {
    for (const locale of ['ru', 'hi', 'zh', 'en']) {
      await page.evaluate(
        (value) =>
          globalThis.localStorage.setItem('metaSovereignLocale', value),
        locale
      );
      await page.reload();
      await select();
      assert.equal(
        (await snapshot.innerText()).includes('vacancy.appliedAt'),
        false
      );
    }
    await page.setViewportSize({ width: 390, height: 900 });
    await shot('phone');
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= globalThis.innerWidth
      ),
      true
    );
  }
  assert(fixture.records.every((row) => row.closed));
  assert.deepEqual(fixture.errors, []);
  return {
    applicationCache: !before,
    locales: before ? 1 : 4,
    reloadReplayed: false,
  };
};
