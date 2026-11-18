import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  vacancyMetadataFixture,
  vacancyDescriptionHtml,
} from '../../../experiments/issue-56/vacancy-metadata-fixture.mjs';
import { decodeWire, LINO_TEXT } from '../../src/transport/lino.js';

const verifyCachedHtml = async (page, base) => {
  const response = await page.request.get(`${base}/api/vacancies/stored`, {
    headers: { accept: LINO_TEXT },
  });
  assert.equal(response.status(), 200);
  assert.equal(
    decodeWire(await response.body(), response.headers()['content-type'])
      .entries[0].descriptionHtml,
    vacancyDescriptionHtml
  );
};

/** One focused native metadata/cache scenario, also mandatory in browser CI. */
export const verifyVacancyMetadataVariants = async (
  browser,
  { screenshots } = {}
) => {
  const fixture = await vacancyMetadataFixture(browser);
  const { page } = fixture;
  const panel = page.locator('[data-vacancies]');
  const action = (name) => panel.locator(`[data-vacancy-action="${name}"]`);
  const snapshot = panel.locator('[data-vacancy-snapshot]');
  const shot = async (name) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await snapshot.scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(screenshots, `${name}.png`) });
    }
  };
  try {
    await page.goto(`${fixture.base}/#/cv`);
    await panel.waitFor();
    await panel.locator('[data-vacancy-field="query"]').fill('Python');
    await action('search').click();
    await panel.locator('[data-vacancy-card]').first().waitFor();
    await action('collect').first().click();
    await snapshot.waitFor();
    await shot('gross');
    const gross = await snapshot.innerText();
    assert.ok(
      gross.includes('от 320 000 ₽ до вычета налогов'),
      'modern gross salary retained'
    );
    assert.ok(
      gross.includes('Hybrid by agreement'),
      'all native work formats retained'
    );
    assert.ok(
      gross.includes('16 November 2026'),
      'native publication retained'
    );
    const saved = await fixture.store.query((row) =>
      row.id.startsWith('assignment-vacancy:')
    );
    assert.equal(saved.length, 1);
    assert.deepEqual(saved[0].skills, ['Python', 'SQL']);
    assert.equal(
      saved[0].description,
      'Build Python services.\nFinal employer paragraph.'
    );
    assert.equal(saved[0].descriptionHtml, vacancyDescriptionHtml);
    assert.equal(saved[0].descriptionHtml.includes('fixtureClicks'), false);
    assert.equal(gross.includes('Hidden template'), false);

    fixture.metadataMode('net');
    await action('refresh').click();
    await page.waitForFunction(() =>
      document
        .querySelector('[data-vacancy-snapshot]')
        ?.innerText.includes('от 280 000 ₽ на руки')
    );
    await shot('net');
    const net = await snapshot.innerText();
    const acknowledged = await fixture.store.query((row) =>
      row.id.startsWith('assignment-vacancy:')
    );
    for (const mode of ['ambiguous-html', 'oversized-html']) {
      fixture.metadataMode(mode);
      await action('refresh').click();
      await panel.locator('[data-vacancy-error]').waitFor();
      assert.equal(await snapshot.innerText(), net);
      assert.deepEqual(
        await fixture.store.query((row) =>
          row.id.startsWith('assignment-vacancy:')
        ),
        acknowledged,
        `${mode} leaves the complete acknowledged cache unchanged`
      );
    }
    fixture.metadataMode('conflict');
    await action('refresh').click();
    await panel.locator('[data-vacancy-error]').waitFor();
    assert.equal(
      await snapshot.innerText(),
      net,
      'ambiguous refresh retains the acknowledged snapshot'
    );
    await shot('refused');

    fixture.metadataMode('duplicate');
    await action('refresh').click();
    await page.waitForFunction(() =>
      document
        .querySelector('[data-vacancy-snapshot]')
        ?.innerText.includes('от 320 000 ₽ до вычета налогов')
    );
    const opens = fixture.records.length;
    await page.reload();
    await panel
      .getByRole('button', { name: 'Python engineer', exact: true })
      .click();
    await snapshot.waitFor();
    assert.ok((await snapshot.innerText()).includes('16 November 2026'));
    assert.equal(
      fixture.records.length,
      opens,
      'cache recovery performs no provider read'
    );
    await verifyCachedHtml(page, fixture.base);
    assert.ok(
      fixture.records.every((record) => record.closed && record.clicks === 0)
    );
    assert.deepEqual(fixture.errors, []);
    await page.setViewportSize({ width: 390, height: 844 });
    await shot('phone');
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= globalThis.innerWidth
      ),
      true
    );
    return {
      variants: 4,
      htmlRefusals: 2,
      exactDescriptionHtml: true,
      opens,
      cacheRetained: true,
      providerClicks: 0,
      pageErrors: 0,
      liveProvider: false,
    };
  } finally {
    await fixture.close();
  }
};
