import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  applicationFixture,
  applicationInput,
} from '../../experiments/issue-56/application-fixture.mjs';
import {
  applicationBatchFixture,
  batchInput,
} from '../../experiments/issue-56/application-batch-fixture.mjs';
import {
  withApplicationRouteFixture,
  closedApplicationFixtureCommand,
  assertApplicationPanelLocales,
  assertApplicationTranslation,
} from './helpers/application-controls.mjs';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { applicationResult } from '../src/jobs/application-result.js';
import { applicationBatchResult } from '../src/jobs/application-batch-data.js';
import { applicationPreviewConfiguration } from '../src/cli/application-configuration.js';

const withPreviewRoute = async (t, type, verify) => {
  const fixture = applicationFixture();
  t.after(() => fixture.close());
  return withApplicationRouteFixture(fixture, type, (api) =>
    verify(api, fixture)
  );
};

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `preview timing is frozen through ${type} and read-only journal recovery`,
    { timeout: 5000 },
    async (t) => {
      await withPreviewRoute(t, type, async (api, fixture) => {
        const input = { ...applicationInput, vacancyPreviewSeconds: 0.25 };
        const receipt = await api.vacancyApplicationOpen(input);
        assert.equal(receipt.vacancyPreviewSeconds, 0.25);
        for (const seconds of [-1, 31, '0.25', null]) {
          assert.throws(() =>
            applicationResult(
              { ...receipt, vacancyPreviewSeconds: seconds },
              input
            )
          );
        }
        assert.throws(() =>
          applicationResult({ ...receipt, vacancyPreviewSeconds: 2 }, input)
        );
        await api.vacancyApplicationClose({
          ...input,
          revision: receipt.revision,
        });
        assert.equal(
          (await api.vacancyApplicationStatus(input)).vacancyPreviewSeconds,
          0.25
        );
        assert.equal(fixture.state.entered + fixture.state.submitted, 0);
      });
    }
  );

  test(
    `batch keeps its preview option through ${type} without restarting work`,
    { timeout: 5000 },
    async (t) => {
      const fixture = applicationBatchFixture(t);
      await withApplicationRouteFixture(fixture, type, async (api) => {
        const input = {
          ...batchInput,
          confirmations: ['send'],
          vacancyPreviewSeconds: 0,
        };
        const receipt = await api.vacancyApplicationBatchStart(input);
        assert.equal(receipt.batch.settings.vacancyPreviewSeconds, 0);
        assert.throws(() =>
          applicationBatchResult(receipt, {
            ...input,
            vacancyPreviewSeconds: 1,
          })
        );
        const stopped = await api.vacancyApplicationBatchStop(batchInput);
        assert.equal(stopped.batch.settings.vacancyPreviewSeconds, 0);
        assert.equal(fixture.state.submitted, 0);
      });
    }
  );
}

test(
  'CLI preview configuration follows explicit, environment, selected/current file and default order',
  { timeout: 5000 },
  async (t) => {
    const cwd = await mkdtemp(join(tmpdir(), 'application-preview-'));
    t.after(() => rm(cwd, { recursive: true, force: true }));
    assert.equal(
      await applicationPreviewConfiguration({}, { cwd, env: {} }),
      3
    );
    await writeFile(join(cwd, '.lenv'), 'vacancyPreviewSeconds: 1.5\n');
    const selected = join(cwd, 'preview.lenv');
    await writeFile(selected, 'vacancyPreviewSeconds: 2.5\n');
    assert.equal(
      await applicationPreviewConfiguration({}, { cwd, env: {} }),
      1.5
    );
    assert.equal(
      await applicationPreviewConfiguration(
        { configuration: selected },
        { cwd, env: {} }
      ),
      2.5
    );
    assert.equal(
      await applicationPreviewConfiguration(
        { configuration: selected },
        { cwd, env: { VACANCY_PREVIEW_SECONDS: '4' } }
      ),
      4
    );
    assert.equal(
      await applicationPreviewConfiguration(
        { configuration: selected, 'vacancy-preview-seconds': 0 },
        { cwd, env: { VACANCY_PREVIEW_SECONDS: '4' } }
      ),
      0
    );
  }
);

test(
  'foreground CLI exposes the independently configured preview and drains its review',
  { timeout: 5000 },
  async (t) => {
    const receipt = await closedApplicationFixtureCommand(t, {
      'vacancy-preview-seconds': '0',
    });
    assert.equal(receipt.vacancyPreviewSeconds, 0);
    assert.equal(receipt.reviewDelayMs, 3000);
  }
);

test('four locales distinguish vacancy preview from filled-answer review', () => {
  assertApplicationPanelLocales(undefined, [], (markup, locale) => {
    assert(markup.includes('data-application-option="vacancyPreviewSeconds"'));
    assert(markup.includes('value="3"'));
    for (const key of [
      'vacancyPreviewSeconds',
      'vacancyPreviewHint',
      'vacancyPreviewPolicy',
    ]) {
      assertApplicationTranslation(locale, key);
    }
  });
});
