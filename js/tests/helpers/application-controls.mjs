import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createApplicationApi } from '../../src/web/application-api.js';
import { ApplicationPanel } from '../../src/web/application-panel.js';
import { translate } from '../../src/web/i18n.js';
import { decodeWire } from '../../src/transport/lino.js';
import { wirePost, withRoutes } from './vacancy-routes.mjs';
import { createVacancyCommands } from '../../src/cli/vacancy-commands.js';
import { applicationInput } from '../../../experiments/issue-56/application-fixture.mjs';

/** A queue reopen reveals the saved draft without editing or submitting it. */
export const assertApplicationReviewOnly = (fixture, receipt, answer) => {
  assert.equal(receipt.state, 'review');
  assert.equal(receipt.draft.fields[0].value, answer);
  assert.equal(fixture.state.fields[1].value, '');
  assert.equal(fixture.state.writes.length, 0);
  assert.equal(fixture.state.submitted, 0);
};

export const runApplicationFixtureCommand = async (
  fixture,
  applicationInputStream,
  args = {}
) => {
  const output = [];
  const commands = createVacancyCommands({
    ...fixture.serviceOptions,
    openStore: async () => fixture.store,
    applicationInput: applicationInputStream,
  });
  const status = await commands['vacancies-application'](
    {
      url: applicationInput.url,
      'request-id': applicationInput.requestId,
      ...args,
    },
    (line) => output.push(decodeWire(line))
  );
  return { status, output };
};

/** Exercise production API decoding and actual route admission in each format. */
export const applicationRouteApi = (base, type) =>
  createApplicationApi({
    get: async (path) => {
      const response = await fetch(`${base}${path}`, {
        headers: { accept: type },
      });
      assert.equal(response.status, 200);
      return decodeWire(
        await response.arrayBuffer(),
        response.headers.get('content-type')
      );
    },
    report: async (path, input, flags) => {
      assert.deepEqual(flags, { network: true, read: false });
      const response = await wirePost(
        base,
        path.split('/').at(-1),
        input,
        type
      );
      assert.equal(response.status, 200, JSON.stringify(response.value));
      return response.value;
    },
  });

/** Reuse isolated route ownership while retaining real API encoding and guards. */
export const withApplicationRouteFixture = (fixture, type, work) =>
  withRoutes((base) => work(applicationRouteApi(base, type), base), {
    store: fixture.store,
    service: fixture.serviceOptions,
  });

export const enterApplicationRoute = async (api) => {
  const receipt = await api.vacancyApplicationOpen(applicationInput);
  return api.vacancyApplicationAdvance({
    url: receipt.url,
    browserSlot: receipt.browserSlot,
    requestId: receipt.requestId,
    revision: receipt.revision,
    action: 'enter',
    confirm: true,
  });
};

export const applicationPanelMarkup = (application, locale) =>
  renderToStaticMarkup(
    React.createElement(ApplicationPanel, {
      t: (key, values) => translate(locale, key, values),
      state: {
        capabilities: { applicationReview: true },
        busy: false,
        application: { known: true, busy: false, ...application },
      },
    })
  );

export const assertApplicationLocaleMarkup = (markup, locale, keys) => {
  for (const key of keys) {
    const translated = translate(locale, `application.${key}`);
    assert(!translated.includes(`application.${key}`));
    assert(
      markup.includes(
        renderToStaticMarkup(
          React.createElement(React.Fragment, null, translated)
        )
      ),
      `${locale}.${key}`
    );
    if (locale !== 'en') {
      assert.notEqual(translated, translate('en', `application.${key}`));
    }
  }
};
