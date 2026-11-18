import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createApplicationApi } from '../../src/web/application-api.js';
import { ApplicationPanel } from '../../src/web/application-panel.js';
import { translate } from '../../src/web/i18n.js';
import { decodeWire } from '../../src/transport/lino.js';
import { wirePost, withRoutes } from './vacancy-routes.mjs';
import { createVacancyCommands } from '../../src/cli/vacancy-commands.js';
import {
  applicationFixture,
  applicationInput,
} from '../../../experiments/issue-56/application-fixture.mjs';

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
  args = {},
  options = {}
) => {
  const output = [];
  const commands = createVacancyCommands({
    ...fixture.serviceOptions,
    openStore: async () => fixture.store,
    applicationInput: applicationInputStream,
    ...options,
  });
  const status = await commands['vacancies-application'](
    {
      url: applicationInput.url,
      'request-id': applicationInput.requestId,
      'no-auto-select-resume-language': true,
      ...args,
    },
    (line) => output.push(decodeWire(line))
  );
  return { status, output };
};

/** Successful foreground commands must finish before their receipts are reviewed. */
export const successfulApplicationFixtureCommand = async (...args) => {
  const { status, output } = await runApplicationFixtureCommand(...args);
  assert.equal(status, 0);
  return output;
};

/** A foreground configuration check owns its fixture and drains through quit. */
export const closedApplicationFixtureCommand = async (t, args) => {
  const fixture = applicationFixture();
  t.after(() => fixture.close());
  const input = async function* () {
    yield 'quit';
  };
  const output = await successfulApplicationFixtureCommand(
    fixture,
    input,
    args
  );
  assert.equal(fixture.state.closed, 1);
  return output[0];
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

export const applicationPanelMarkup = (application, locale, state = {}) =>
  renderToStaticMarkup(
    React.createElement(ApplicationPanel, {
      t: (key, values) => translate(locale, key, values),
      state: {
        capabilities: { applicationReview: true },
        busy: false,
        ...state,
        application: { known: true, busy: false, ...application },
      },
    })
  );

export const assertApplicationTranslation = (locale, suffix) => {
  const key = `application.${suffix}`;
  const value = translate(locale, key);
  assert(!value.includes(key));
  if (locale !== 'en') {
    assert.notEqual(value, translate('en', key));
  }
  return value;
};

export const assertApplicationLocaleMarkup = (markup, locale, keys) => {
  for (const key of keys) {
    const translated = assertApplicationTranslation(locale, key);
    assert(
      markup.includes(
        renderToStaticMarkup(
          React.createElement(React.Fragment, null, translated)
        )
      ),
      `${locale}.${key}`
    );
  }
};

/** Render the shared application panel in every supported locale. */
export const assertApplicationPanelLocales = (
  receipt,
  keys,
  check = () => {}
) => {
  for (const locale of ['en', 'ru', 'hi', 'zh']) {
    const markup = applicationPanelMarkup({ receipt, options: {} }, locale);
    assertApplicationLocaleMarkup(markup, locale, keys);
    check(markup, locale);
  }
};
