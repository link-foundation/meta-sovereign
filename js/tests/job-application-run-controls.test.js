import {
  withApplicationRouteFixture,
  applicationPanelMarkup,
  assertApplicationLocaleMarkup,
} from './helpers/application-controls.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applicationRunFixture,
  applicationIdentity as identity,
} from '../../experiments/issue-56/application-run-fixture.mjs';
import { applicationInput } from '../../experiments/issue-56/application-fixture.mjs';
import { LINO_TEXT, LINO_BINARY, encodeWire } from '../src/transport/lino.js';

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `browser application API retains slot policy across HTTP reviews over ${type}`,
    { timeout: 10000 },
    async (t) => {
      const fixture = applicationRunFixture();
      t.after(() => fixture.close());
      await withApplicationRouteFixture(fixture, type, async (api, base) => {
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
      });
    }
  );
}

test(
  'four-language application controls disclose worker scope and retain both checked choices',
  { timeout: 3000 },
  async (t) => {
    const fixture = applicationRunFixture();
    t.after(() => fixture.close());
    let receipt = await fixture.service['application-open'](applicationInput);
    receipt = await fixture.service['application-mode'](
      identity(receipt, { paused: true, noQuestionnaires: true })
    );
    for (const locale of ['en', 'ru', 'hi', 'zh']) {
      const markup = applicationPanelMarkup(
        {
          receipt,
          intent: identity(receipt),
          target: identity(receipt),
        },
        locale
      );
      assertApplicationLocaleMarkup(markup, locale, [
        'pause',
        'noQuestionnaires',
        'sessionHint',
      ]);
      for (const option of ['paused', 'noQuestionnaires']) {
        assert.match(
          markup,
          new RegExp(`data-application-option="${option}"[^>]*checked=""`)
        );
      }
      assert.match(markup, /data-application-action="submit" disabled=""/u);
    }
  }
);
