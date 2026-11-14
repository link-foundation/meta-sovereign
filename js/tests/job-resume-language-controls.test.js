import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LINO_TEXT, LINO_BINARY, decodeWire } from '../src/transport/lino.js';
import { withRoutes, wirePost } from './helpers/vacancy-routes.mjs';
import { resumeLanguageFixture } from '../../experiments/issue-56/resume-language-fixture.mjs';
import { resumeListFixture } from '../../experiments/issue-56/resume-list-fixture.mjs';
import { VacancyResumes } from '../src/web/vacancy-resumes.js';
import { LocaleContext, translate } from '../src/web/i18n.js';
import { createVacancyCommands } from '../src/cli/vacancy-commands.js';

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `checked resume language survives ${type} and an explicit choice`,
    { timeout: 10000 },
    async (t) => {
      const fixture = await resumeLanguageFixture();
      t.after(fixture.close);
      await withRoutes(
        async (base, calls) => {
          const response = await wirePost(
            base,
            'resumes',
            { resumeLanguage: 'ru' },
            type
          );
          assert.equal(response.status, 200);
          assert.equal(response.value.selection.hash, 'english');
          const list = response.value;
          for (const locale of ['en', 'ru', 'hi', 'zh']) {
            const t = (key, params) => translate(locale, key, params);
            const markup = renderToStaticMarkup(
              React.createElement(
                LocaleContext.Provider,
                { value: { locale, t } },
                React.createElement(VacancyResumes, {
                  state: {
                    resumeLists: [list],
                    values: { browserSlot: 'jobs', resumeLanguage: 'ru' },
                  },
                  t,
                })
              )
            );
            assert.match(markup, /data-resume-language="ru"/);
            assert(!markup.includes('vacancy.resumeProof'));
            assert(
              markup.includes(
                t('vacancy.resumeProof.ru', { date: 'DATE' }).split('DATE')[0]
              )
            );
          }
          const manual = await wirePost(
            base,
            'resumes',
            { resume: 'russian-old' },
            type
          );
          assert.equal(manual.value.selection.hash, 'russian-old');
          assert.equal(manual.value.selection.reason, 'specified');
          assert.deepEqual(calls, ['resumes', 'resumes']);
        },
        {
          store: fixture.store,
          service: { artifactRoot: fixture.artifactRoot },
        }
      );
    }
  );
}

test(
  'vacancy CLI exposes checked export evidence without opening an application',
  { timeout: 10000 },
  async (t) => {
    const fixture = await resumeLanguageFixture();
    t.after(fixture.close);
    const output = [];
    const commands = createVacancyCommands({
      openStore: async () => fixture.store,
      artifactRoot: fixture.artifactRoot,
      readResumes: async () => resumeListFixture(),
    });
    const status = await commands['vacancies-resumes'](
      { 'resume-language': 'ru' },
      (line) => output.push(decodeWire(line))
    );
    assert.equal(status, 0);
    assert.equal(output.at(-1).selection.hash, 'english');
    assert.equal(output.at(-1).selection.languageEvidence, 'native-export');
  }
);
