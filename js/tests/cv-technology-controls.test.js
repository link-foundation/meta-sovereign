import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { createVacancyService } from '../src/jobs/service.js';
import {
  createVacancyCommands,
  VACANCY_HELP,
} from '../src/cli/vacancy-commands.js';
import { createVacancyApi } from '../src/web/vacancy-api.js';
import { decodeWire, LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { CvTechnologyReview } from '../src/web/cv-technology-review.js';
import { renderInLocale } from './util-render.js';
import { translate } from '../src/web/i18n.js';
import { withRoutes, wirePost } from './helpers/vacancy-routes.mjs';
import { cvTechnologyFixture } from '../../experiments/issue-56/cv-technology-fixture.mjs';

const fixtureTest = async (work) => {
  const data = await cvTechnologyFixture();
  const service = createVacancyService(data);
  try {
    const catalog = await service['technology-catalog']();
    return await work({
      ...data,
      service,
      catalog,
      input: { ...data.input, revision: catalog.revision },
    });
  } finally {
    await service.stop();
    await data.close();
  }
};
for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(`bilingual review routes authenticate generation and selected saves through ${type}`, async () => {
    await fixtureTest(async (data) =>
      withRoutes(
        async (base, calls) => {
          const denied = await wirePost(
            base,
            'technology-review',
            data.input,
            type,
            { origin: 'https://untrusted.test' }
          );
          assert.equal(denied.status, 403);
          const draft = await wirePost(
            base,
            'technology-review',
            data.input,
            type
          );
          assert.equal(draft.status, 200);
          const selected = ['en:about'];
          const saved = await wirePost(
            base,
            'technology-review-save',
            {
              browserSlot: 'jobs',
              fingerprint: draft.value.review.fingerprint,
              selected,
            },
            type
          );
          assert.equal(saved.status, 200);
          assert.equal(saved.value.review.status, 'reviewed');
          const response = await fetch(
            `${base}/api/vacancies/technology-review-stored?browserSlot=jobs`,
            { headers: { accept: type } }
          );
          assert.deepEqual(
            decodeWire(
              await response.arrayBuffer(),
              response.headers.get('content-type')
            ),
            saved.value
          );
          assert.equal(
            (
              await wirePost(
                base,
                'technology-review',
                { ...data.input, revision: 'stale' },
                type
              )
            ).status,
            409
          );
          assert.equal(
            (await fetch(`${base}/api/vacancies/technology-review`)).status,
            405
          );
          assert.deepEqual(calls, []);
        },
        { store: data.store, service: { artifactRoot: data.artifactRoot } }
      )
    );
  });
}
test('CLI accepts two exact exports and acknowledges only explicitly selected local review fields', async () => {
  await fixtureTest(async (data) => {
    let closes = 0;
    data.store.close = async () => {
      closes++;
    };
    const commands = createVacancyCommands({
      openStore: async () => data.store,
      artifactRoot: data.artifactRoot,
    });
    const output = [];
    const log = (text) => output.push(decodeWire(text));
    const args = { revision: data.catalog.revision };
    for (const [index, language] of ['ru', 'en'].entries()) {
      args[`${language}-export-id`] = data.input.exports[index].exportId;
      args[`${language}-resume`] = data.input.exports[index].hash;
    }
    assert.equal(await commands['vacancies-technology-review'](args, log), 0);
    const draft = output.at(-1);
    assert.equal(
      await commands['vacancies-technology-review-save'](
        { fingerprint: draft.review.fingerprint, selected: 'ru:about' },
        log
      ),
      0
    );
    const saved = output.at(-1);
    assert.equal(saved.review.status, 'reviewed');
    await commands['vacancies-technology-review-stored']({}, log);
    assert.deepEqual(output.at(-1), saved);
    assert.equal(closes, 3);
    assert.match(VACANCY_HELP, /--ru-export-id/u);
  });
});
test('browser API validates draft identity, exact save acknowledgements and offline cached recovery', async () => {
  await fixtureTest(async (data) => {
    const draft = await data.service['technology-review'](data.input);
    const seen = [];
    let answer = draft;
    const api = createVacancyApi({
      get: async () => null,
      local: async () => data.store,
      report: async (...args) => {
        seen.push(args);
        return answer;
      },
    });
    assert.deepEqual(await api.vacancyCvTechnologyReview(data.input), draft);
    assert.deepEqual(seen[0][2], { network: true, read: false });
    await assert.rejects(
      api.vacancyCvTechnologyReview({ ...data.input, browserSlot: 'other' })
    );
    const saving = {
      browserSlot: 'jobs',
      fingerprint: draft.review.fingerprint,
      selected: ['en:about'],
    };
    answer = await data.service['technology-review-save'](saving);
    assert.deepEqual(await api.vacancyCvTechnologyReviewSave(saving), answer);
    await assert.rejects(
      api.vacancyCvTechnologyReviewSave({ ...saving, selected: ['ru:about'] })
    );
    await assert.rejects(
      api.vacancyCvTechnologyReviewSave({
        ...saving,
        fingerprint: 'a'.repeat(64),
      })
    );
    assert.deepEqual(
      await api.vacancyCvTechnologyReviewStored({ browserSlot: 'jobs' }),
      answer
    );
  });
});
test('four localized views show original/proposed evidence, explicit exports and honest local-save labels', async () => {
  await fixtureTest(async (data) => {
    const { review } = await data.service['technology-review'](data.input);
    const state = {
      values: { browserSlot: 'jobs' },
      busy: '',
      resumeExports: { exports: data.receipts },
      technology: { catalog: data.catalog, dirty: false },
      cvTechnology: {
        review,
        choices: { ru: '', en: '' },
        selected: [],
        loadError: false,
      },
    };
    for (const locale of ['en', 'ru', 'zh', 'hi']) {
      const html = renderInLocale(
        locale,
        React.createElement(CvTechnologyReview, {
          state,
          t: (key) => translate(locale, key),
        })
      );
      assert.ok(html.includes(translate(locale, 'cvTechnology.title')));
      assert.ok(html.includes(translate(locale, 'cvTechnology.hint')));
      assert.ok(html.includes(translate(locale, 'cvTechnology.before')));
      assert.ok(html.includes(translate(locale, 'cvTechnology.save')));
      assert.match(
        html,
        /<button[^>]*disabled=""[^>]*data-cv-technology-action="generate"/u
      );
      assert.ok(html.includes(review.sources[0].identity.sha256));
      assert.ok(html.includes('Keep this final narrative unchanged.'));
      assert.doesNotMatch(html, />cvTechnology\./u);
    }
  });
});
