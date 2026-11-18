import assert from 'node:assert/strict';
import {
  collectFirstVacancy,
  vacancySnapshotShot,
} from './vacancy-browser-controls.mjs';
import {
  publicationText,
  vacancyModernFixture,
  vacancyModernHtml,
} from '../../../experiments/issue-56/vacancy-modern-fixture.mjs';
import { readAssignmentVacancyDocument } from '../../src/assignments/vacancy-reader.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  decodeWire,
  encodeWire,
} from '../../src/transport/lino.js';

const savedRows = (fixture) =>
  fixture.store.query((row) => row.id.startsWith('assignment-vacancy:'));

const collect = async (fixture, type) => {
  const body = encodeWire(
    { url: 'https://hh.ru/vacancy/123', refresh: true },
    type
  );
  const response = await fixture.page.request.post(
    `${fixture.base}/api/vacancies/collect`,
    {
      headers: { origin: fixture.base, accept: type, 'content-type': type },
      data: typeof body === 'string' ? body : Buffer.from(body),
    }
  );
  return {
    status: response.status(),
    value: decodeWire(await response.body(), type),
  };
};

const verifyRefusals = async (fixture) => {
  const acknowledged = await savedRows(fixture);
  const invalid = [
    'employment-conflict',
    'employment-oversized',
    'publication-conflict',
    'date-conflict',
    'date-missing',
    'date-invalid',
    'publication-oversized',
    'too-many-dates',
  ];
  for (const [index, mode] of invalid.entries()) {
    fixture.metadataMode(mode);
    const reply = await collect(fixture, index % 2 ? LINO_BINARY : LINO_TEXT);
    assert.equal(reply.status, 400, `${mode} refuses collection`);
    assert.deepEqual(
      await savedRows(fixture),
      acknowledged,
      `${mode} preserves saved content`
    );
  }
  return invalid.length;
};

const verifyDirectDom = async (browser) => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.setContent(vacancyModernHtml('none'));
    const read = await page.evaluate(readAssignmentVacancyDocument);
    assert.equal(
      read.published,
      '',
      'owner content, recommendations, hidden and unrelated dates are ignored'
    );
    assert.equal(read.employment, '');
  } finally {
    await context.close();
  }
};

/** One finite synthetic native scenario; no real provider or account traffic. */
export const verifyVacancyModern = async (browser, { screenshots } = {}) => {
  const fixture = await vacancyModernFixture(browser);
  const { page } = fixture;
  const panel = page.locator('[data-vacancies]');
  const snapshot = panel.locator('[data-vacancy-snapshot]');
  const shot = vacancySnapshotShot(page, snapshot, screenshots);
  try {
    await collectFirstVacancy(fixture);
    await shot('desktop');
    const initial = (await savedRows(fixture))[0];
    assert.equal(
      initial.employment,
      'Полная занятость',
      'modern native employment retained'
    );
    assert.equal(
      initial.published,
      publicationText,
      'modern native publication retained'
    );
    assert.ok(initial.descriptionHtml.includes('<time datetime='));
    assert.ok(
      initial.description.includes(publicationText),
      'employer prose remains complete'
    );
    for (const [mode, type] of [
      ['legacy', LINO_TEXT],
      ['equivalent', LINO_BINARY],
      ['modern', LINO_TEXT],
    ]) {
      fixture.metadataMode(mode);
      const reply = await collect(fixture, type);
      assert.equal(reply.status, 200, `${mode} succeeds`);
      assert.equal(
        reply.value.employment,
        mode === 'legacy' ? 'Full time' : initial.employment
      );
      assert.equal(
        reply.value.published,
        mode === 'legacy' ? '16 November 2026' : initial.published
      );
    }
    const refused = await verifyRefusals(fixture);
    const acknowledged = (await savedRows(fixture))[0];
    const opens = fixture.records.length;
    await page.reload();
    await panel
      .getByRole('button', { name: 'Python engineer', exact: true })
      .click();
    await snapshot.waitFor();
    assert.ok((await snapshot.innerText()).includes('Полная занятость'));
    assert.equal(fixture.records.length, opens, 'recovery uses the cache');
    for (const type of [LINO_TEXT, LINO_BINARY]) {
      const response = await page.request.get(
        `${fixture.base}/api/vacancies/stored`,
        { headers: { accept: type } }
      );
      assert.equal(response.status(), 200);
      const saved = decodeWire(await response.body(), type).entries[0];
      assert.equal(saved.employment, initial.employment);
      assert.equal(saved.published, initial.published);
      assert.equal(saved.descriptionHtml, initial.descriptionHtml);
      assert.equal(saved.firstSeenAt, initial.firstSeenAt);
      assert.equal(saved.lastSeenAt, acknowledged.lastSeenAt);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await shot('phone');
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= globalThis.innerWidth
      ),
      true
    );
    await verifyDirectDom(browser);
    assert.ok(
      fixture.records.every((record) => record.closed && record.clicks === 0)
    );
    assert.deepEqual(fixture.errors, []);
    return {
      modernMetadata: true,
      successfulVariants: 4,
      refused,
      cacheRecovered: true,
      wireFormats: 2,
      providerOpens: opens,
      providerClicks: 0,
      pageErrors: 0,
      liveProvider: false,
    };
  } finally {
    await fixture.close();
  }
};
