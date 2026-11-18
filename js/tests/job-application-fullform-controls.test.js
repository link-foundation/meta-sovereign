import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationFullFormFixture } from '../../experiments/issue-56/application-fullform-fixture.mjs';
import { applicationIdentity as identity } from '../../experiments/issue-56/application-run-fixture.mjs';
import { applicationInput } from '../../experiments/issue-56/application-fixture.mjs';
import {
  withApplicationRouteFixture,
  successfulApplicationFixtureCommand,
  applicationPanelMarkup,
} from './helpers/application-controls.mjs';
import { wirePost } from './helpers/vacancy-routes.mjs';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { translate } from '../src/web/i18n.js';

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `full-form navigation over ${type} preserves review and rejects foreign origins`,
    { timeout: 10000 },
    async (t) => {
      const fixture = await applicationFullFormFixture(t, { open: false });
      await withApplicationRouteFixture(fixture, type, async (api, base) => {
        const opened = await api.vacancyApplicationOpen(applicationInput);
        const input = identity(opened, { action: 'form', confirm: true });
        assert.equal(
          (
            await wirePost(base, 'application-advance', input, type, {
              origin: 'https://foreign.test',
            })
          ).status,
          403
        );
        const receipt = await api.vacancyApplicationAdvance(input);
        assert.equal(receipt.state, 'review');
        assert.equal(receipt.attempted.enter, false);
        assert.equal(receipt.delivery, 'none');
        assert.equal(fixture.state.navigated, 1);
        assert.equal(fixture.state.entered, 0);
        assert.equal(fixture.state.submitted, 0);
        await api.vacancyApplicationClose(identity(receipt));
      });
    }
  );
}

test(
  'foreground form command reviews without clicking entry or sending',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationFullFormFixture(t, { open: false });
    const actions = async function* () {
      yield 'form';
      yield 'quit';
    };
    const output = await successfulApplicationFixtureCommand(fixture, actions);
    assert(output[1].commands.includes('form'));
    assert.equal(output.at(-1).state, 'review');
    assert.equal(fixture.state.navigated, 1);
    assert.equal(fixture.state.entered, 0);
    assert.equal(fixture.state.submitted, 0);
    assert.equal(fixture.state.closed, 1);
  }
);

test(
  'four locales expose full-form review disabled until fresh confirmation',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationFullFormFixture(t);
    for (const locale of ['en', 'ru', 'hi', 'zh']) {
      const label = translate(locale, 'application.form');
      assert.notEqual(label, 'application.form');
      if (locale !== 'en') {
        assert.notEqual(label, translate('en', 'application.form'));
      }
      const markup = applicationPanelMarkup(
        {
          receipt: fixture.opened,
          intent: identity(fixture.opened),
          target: identity(fixture.opened),
          options: {},
        },
        locale
      );
      assert.match(markup, /data-application-action="form" disabled=""/u);
      assert(markup.includes(label));
    }
  }
);
