import assert from 'node:assert/strict';
import {
  collectFirstVacancy,
  vacancySnapshotShot,
} from './vacancy-browser-controls.mjs';
import {
  vacancyMetadataFixture,
  vacancyDescriptionHtml,
} from '../../../experiments/issue-56/vacancy-metadata-fixture.mjs';
import { decodeWire, LINO_TEXT } from '../../src/transport/lino.js';

const verifyCachedHtml = async (page, base, history) => {
  const response = await page.request.get(`${base}/api/vacancies/stored`, {
    headers: { accept: LINO_TEXT },
  });
  assert.equal(response.status(), 200);
  const saved = decodeWire(
    await response.body(),
    response.headers()['content-type']
  ).entries[0];
  assert.equal(saved.descriptionHtml, vacancyDescriptionHtml);
  assert.equal(saved.firstSeenAt, history.firstSeenAt);
  assert.equal(saved.lastSeenAt, history.lastSeenAt);
};

const verifyInitialCache = async (snapshot, saved, gross) => {
  assert.equal(saved.length, 1);
  assert.equal(saved[0].firstSeenAt, saved[0].capturedAt);
  assert.equal(saved[0].lastSeenAt, saved[0].capturedAt);
  assert.match(
    await snapshot.locator('[data-vacancy-observed="firstSeenAt"]').innerText(),
    /^First collected: /u
  );
  assert.match(
    await snapshot.locator('[data-vacancy-observed="lastSeenAt"]').innerText(),
    /^Last collected: /u
  );
  assert.deepEqual(saved[0].skills, ['Python', 'SQL']);
  assert.equal(
    saved[0].description,
    'Build Python services.\nFinal employer paragraph.'
  );
  assert.equal(saved[0].descriptionHtml, vacancyDescriptionHtml);
  assert.equal(saved[0].descriptionHtml.includes('fixtureClicks'), false);
  assert.equal(gross.includes('Hidden template'), false);
};

const verifyPhone = async (page, shot) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await shot('phone');
  assert.equal(
    await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth
    ),
    true
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
  const shot = vacancySnapshotShot(page, snapshot, screenshots);
  try {
    await collectFirstVacancy(fixture);
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
    await verifyInitialCache(snapshot, saved, gross);

    fixture.metadataMode('net');
    await action('refresh').click();
    await page.waitForFunction(() =>
      globalThis.document
        .querySelector('[data-vacancy-snapshot]')
        ?.innerText.includes('от 280 000 ₽ на руки')
    );
    await shot('net');
    const net = await snapshot.innerText();
    const acknowledged = await fixture.store.query((row) =>
      row.id.startsWith('assignment-vacancy:')
    );
    assert.equal(acknowledged[0].firstSeenAt, saved[0].firstSeenAt);
    assert.equal(acknowledged[0].lastSeenAt, acknowledged[0].capturedAt);
    assert.ok(
      Date.parse(acknowledged[0].lastSeenAt) > Date.parse(saved[0].lastSeenAt)
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
      globalThis.document
        .querySelector('[data-vacancy-snapshot]')
        ?.innerText.includes('от 320 000 ₽ до вычета налогов')
    );
    const opens = fixture.records.length;
    const refreshed = (
      await fixture.store.query((row) =>
        row.id.startsWith('assignment-vacancy:')
      )
    )[0];
    assert.equal(refreshed.firstSeenAt, saved[0].firstSeenAt);
    const historyLabels = await snapshot
      .locator('[data-vacancy-observed]')
      .allTextContents();
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
    assert.deepEqual(
      await snapshot.locator('[data-vacancy-observed]').allTextContents(),
      historyLabels
    );
    await verifyCachedHtml(page, fixture.base, refreshed);
    assert.ok(
      fixture.records.every((record) => record.closed && record.clicks === 0)
    );
    assert.deepEqual(fixture.errors, []);
    await verifyPhone(page, shot);
    return {
      variants: 4,
      htmlRefusals: 2,
      exactDescriptionHtml: true,
      observationHistory: true,
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
