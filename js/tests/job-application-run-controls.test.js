import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  applicationRunFixture,
  applicationIdentity as identity,
} from '../../experiments/issue-56/application-run-fixture.mjs';
import { applicationInput } from '../../experiments/issue-56/application-fixture.mjs';
import { withRoutes, wirePost } from './helpers/vacancy-routes.mjs';
import { LINO_TEXT, LINO_BINARY, encodeWire } from '../src/transport/lino.js';
import { createApplicationApi } from '../src/web/application-api.js';
import { ApplicationPanel } from '../src/web/application-panel.js';
import { translate } from '../src/web/i18n.js';

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `browser application API retains slot policy across HTTP reviews over ${type}`,
    { timeout: 10000 },
    async () => {
      const fixture = applicationRunFixture();
      try {
        await withRoutes(
          async (base) => {
            const api = createApplicationApi({
              report: async (path, input, flags) => {
                assert.deepEqual(flags, { network: true, read: false });
                const response = await wirePost(
                  base,
                  path.split('/').at(-1),
                  input,
                  type
                );
                assert.equal(
                  response.status,
                  200,
                  JSON.stringify(response.value)
                );
                return response.value;
              },
            });
            let receipt = await api.vacancyApplicationOpen(applicationInput);
            receipt = await api.vacancyApplicationMode(
              identity(receipt, { paused: true, noQuestionnaires: true })
            );
            assert.equal(receipt.state, 'paused');
            await api.vacancyApplicationClose(identity(receipt));
            receipt = await api.vacancyApplicationOpen({
              ...applicationInput,
              url: 'https://hh.ru/vacancy/456',
              requestId: 'next',
            });
            assert.equal(receipt.paused, true);
            assert.equal(receipt.noQuestionnaires, true);
            assert.equal(receipt.state, 'paused');
            const signal = await fetch(
              `${base}/api/vacancies/application-signal-mode`,
              {
                method: 'POST',
                headers: { 'content-type': type },
                body: encodeWire(
                  identity(receipt, { noQuestionnaires: false }),
                  type
                ),
              }
            );
            assert.equal(
              signal.status,
              404,
              'foreground interruption is not an HTTP operation'
            );
            await signal.arrayBuffer();
            receipt = await api.vacancyApplicationRead(identity(receipt));
            assert.equal(receipt.noQuestionnaires, true);
            assert.equal(fixture.state.entered, 0);
            assert.equal(fixture.state.submitted, 0);
            await api.vacancyApplicationClose(identity(receipt));
          },
          { store: fixture.store, service: fixture.serviceOptions }
        );
      } finally {
        await fixture.close();
      }
    }
  );
}

test(
  'four-language application controls disclose worker scope and retain both checked choices',
  { timeout: 3000 },
  async () => {
    const fixture = applicationRunFixture();
    try {
      let receipt = await fixture.service['application-open'](applicationInput);
      receipt = await fixture.service['application-mode'](
        identity(receipt, { paused: true, noQuestionnaires: true })
      );
      for (const locale of ['en', 'ru', 'hi', 'zh']) {
        const t = (key, values) => translate(locale, key, values);
        const markup = renderToStaticMarkup(
          React.createElement(ApplicationPanel, {
            t,
            state: {
              capabilities: { applicationReview: true },
              busy: false,
              application: {
                receipt,
                intent: identity(receipt),
                target: identity(receipt),
                known: true,
                busy: false,
              },
            },
          })
        );
        for (const key of ['pause', 'noQuestionnaires', 'sessionHint']) {
          const translated = t(`application.${key}`);
          assert(!translated.includes(`application.${key}`));
          assert(markup.includes(translated));
          if (locale !== 'en') {
            assert.notEqual(translated, translate('en', `application.${key}`));
          }
        }
        for (const option of ['paused', 'noQuestionnaires']) {
          assert.match(
            markup,
            new RegExp(`data-application-option="${option}"[^>]*checked=""`)
          );
        }
        assert.match(markup, /data-application-action="submit" disabled=""/u);
      }
    } finally {
      await fixture.close();
    }
  }
);
