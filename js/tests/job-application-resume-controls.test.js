import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { applicationResumeFixture } from '../../experiments/issue-56/application-resume-fixture.mjs';
import { applicationIdentity } from '../../experiments/issue-56/application-run-fixture.mjs';
import { applicationResumeOptions } from '../../experiments/issue-56/application-resume-options-fixture.mjs';
import {
  withApplicationRouteFixture,
  enterApplicationRoute,
  runApplicationFixtureCommand,
} from './helpers/application-controls.mjs';
import { wirePost } from './helpers/vacancy-routes.mjs';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { createApplicationApi } from '../src/web/application-api.js';
import { ApplicationResumeView } from '../src/web/application-resume-view.js';
import { translate } from '../src/web/i18n.js';

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `native resume hash choice crosses ${type} without sending or foreign-origin admission`,
    { timeout: 10000 },
    async (t) => {
      const fixture = await applicationResumeFixture(t, { enter: false });
      await withApplicationRouteFixture(fixture, type, async (api, base) => {
        let receipt = await enterApplicationRoute(api);
        const rejected = await wirePost(
          base,
          'application-resume',
          applicationIdentity(receipt, { action: 'menu', confirm: true }),
          type,
          { origin: 'https://foreign.test' }
        );
        assert.equal(rejected.status, 403);
        receipt = await api.vacancyApplicationResume(
          applicationIdentity(receipt, { action: 'menu', confirm: true })
        );
        receipt = await api.vacancyApplicationResume(
          applicationIdentity(receipt, {
            action: 'choose',
            resume: 'english',
            confirm: true,
          })
        );
        assert.equal(receipt.resumeSelection.languageProof.language, 'ru');
        assert.equal(fixture.state.resumeWrites, 1);
        assert.equal(fixture.state.submitted, 0);
        await api.vacancyApplicationClose(applicationIdentity(receipt));
      });
    }
  );
}

test(
  'CLI separately opens and chooses an export-backed resume while resume still unpauses',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationResumeFixture(t, { enter: false });
    const actions = async function* () {
      yield 'enter';
      yield 'pause';
      yield 'resume';
      yield 'resume-menu';
      yield 'choose-resume english';
      yield 'quit';
    };
    const { status, output } = await runApplicationFixtureCommand(
      fixture,
      actions
    );
    assert.equal(status, 0);
    assert(output[1].commands.includes('choose-resume <hash>'));
    assert.equal(output.at(-1).resumeSelection.hash, 'english');
    assert.equal(fixture.state.resumeWrites, 1);
    assert.equal(fixture.state.submitted, 0);
    assert.equal(fixture.state.closed, 1);
  }
);

test(
  'browser resume API rejects absent, altered and mismatched evidence without repeating mutations',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationResumeFixture(t);
    const opened = await fixture.menu(fixture.entered);
    const receipt = await fixture.choose(opened);
    let raw = receipt,
      calls = 0;
    const api = createApplicationApi({
      report: async () => {
        calls++;
        return raw;
      },
    });
    const input = applicationIdentity(opened, {
      action: 'choose',
      resume: 'english',
      confirm: true,
    });
    await api.vacancyApplicationResume(input);
    const invalid = [
      undefined,
      { ...receipt.resumeSelection, hash: 'russian-old' },
      {
        ...receipt.resumeSelection,
        languageProof: {
          ...receipt.resumeSelection.languageProof,
          sha256: 'bad',
        },
      },
    ];
    for (const resumeSelection of invalid) {
      raw = { ...receipt, resumeSelection };
      await assert.rejects(api.vacancyApplicationResume(input), {
        code: 'jobs-application-unconfirmed',
      });
    }
    assert.equal(calls, 4);
    assert.equal(fixture.state.resumeWrites, 1);
  }
);

test('four locales escape native titles and retain disabled ambiguous and unconfirmed choices', () => {
  for (const locale of ['en', 'ru', 'hi', 'zh']) {
    const t = (key, values) => translate(locale, key, values);
    for (const suffix of [
      'resume',
      'resumeHint',
      'resumeUnavailable',
      'resumeOpen',
      'resumeClose',
      'resumeChoose',
      'resumeVerified',
    ]) {
      assert.notEqual(t(`application.${suffix}`), `application.${suffix}`);
      if (locale !== 'en') {
        assert.notEqual(
          t(`application.${suffix}`),
          translate('en', `application.${suffix}`)
        );
      }
    }
    const receipt = {
      page: {
        resumeChooser: {
          title: '<script>private title</script>',
          open: true,
          disabled: false,
          ambiguous: true,
          options: applicationResumeOptions(),
        },
      },
    };
    const markup = renderToStaticMarkup(
      React.createElement(ApplicationResumeView, {
        receipt,
        action: () => () => {},
        writable: false,
        t,
      })
    );
    assert(markup.includes('&lt;script&gt;private title&lt;/script&gt;'));
    assert(!markup.includes('<script>'));
    assert.equal((markup.match(/disabled=""/gu) ?? []).length, 4);
    assert(!markup.includes('application.'));
  }
});
