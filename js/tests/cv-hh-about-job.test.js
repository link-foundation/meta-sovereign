import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { cvTechnologyFixture } from '../../experiments/issue-56/cv-technology-fixture.mjs';
import { seedHhAboutExperience } from '../../experiments/issue-56/cv-hh-about-fixture.mjs';
import {
  cvFixtureRequest,
  startCvFixtureServer,
} from '../../experiments/issue-56/cv-fixture-server.mjs';
import { createHhExperienceWorkplaceCommands } from '../src/cli/cv-hh-experience-workplace-command.js';
import { hhExperienceAboutSource } from '../src/jobs/cv-experience-about-source.js';
import { LINO_BINARY, LINO_TEXT } from '../src/transport/lino.js';

const waitFor = async (fetchStatus, phase) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    const row = await fetchStatus();
    if (row.phase === phase) {
      return row;
    }
    if (['failed', 'unconfirmed'].includes(row.phase)) {
      assert.fail(`Unexpected review status: ${row.phase} ${row.code}`);
    }
    await delay(15);
  }
  assert.fail(`About review did not reach ${phase}`);
};

test('the exact About change stays bound to the saved HeadHunter CV', async () => {
  const fixture = await cvTechnologyFixture();
  try {
    const { input, identity, before, after } =
      await seedHhAboutExperience(fixture);
    assert.deepEqual(await hhExperienceAboutSource(fixture, input), {
      field: 'about',
      hash: identity.hash,
      language: 'en',
      browserSlot: identity.browserSlot,
      before,
      after,
    });
    await assert.rejects(
      hhExperienceAboutSource(fixture, {
        ...input,
        fingerprint: 'f'.repeat(64),
      }),
      { code: 'jobs-cv-experience-about-plan' }
    );
    await fixture.store.delete(
      `jobs-resume-export:${identity.browserSlot}:${identity.hash}`
    );
    await assert.rejects(hhExperienceAboutSource(fixture, input), {
      code: 'jobs-cv-conflict',
    });
  } finally {
    await fixture.close();
  }
});

test(
  'CLI EOF and both Lino encodings preserve the explicit About Save boundary',
  {
    timeout: 8000,
  },
  async () => {
    const fixture = await cvTechnologyFixture();
    const events = [];
    const prepareJob = async (change, signal, update, selection) => {
      events.push(change.field);
      await update({ phase: 'prepared' });
      while (!selection()) {
        await delay(10, undefined, { signal });
      }
      events.push(selection());
      if (selection() === 'skip') {
        return { phase: 'skipped' };
      }
      await update({ phase: 'saving', initiator: 'cli-or-api' });
      await update({ phase: 'verifying' });
      return {
        phase: 'saved',
        save: {
          evidence: 'verified-hh-about-export',
          exports: [{ hash: change.hash, sha256: 'a'.repeat(64) }],
        },
      };
    };
    const { input, identity } = await seedHhAboutExperience(fixture);
    const app = await startCvFixtureServer({
      store: fixture.store,
      cv: { experience: { hhWorkplace: { prepareJob } } },
      vacancies: { artifactRoot: fixture.artifactRoot },
    });
    const request = cvFixtureRequest(
      `http://127.0.0.1:${app.port}/api/cv/experience/hh-about-`,
      ['status']
    );
    try {
      const commands = createHhExperienceWorkplaceCommands(
        { openStore: async () => fixture.store },
        {
          artifactRoot: fixture.artifactRoot,
          prepareJob,
          stdin: Readable.from([]),
          wait: () => delay(10),
          notice: () => {},
        }
      );
      let cli;
      assert.equal(
        await commands['cv-experience-hh-about-start'](
          {
            'plan-request-id': input.planRequestId,
            'request-id': 'about-terminal',
            fingerprint: input.fingerprint,
          },
          (text) => {
            cli = JSON.parse(text);
          }
        ),
        0
      );
      assert.equal(cli.phase, 'stopped');
      assert.equal(cli.providerSaved, false);

      for (const [type, choice, phase] of [
        [LINO_TEXT, 'skip', 'skipped'],
        [LINO_BINARY, 'save', 'saved'],
      ]) {
        const options = { ...input, requestId: `about-${choice}` };
        const status = async () =>
          (await request('status', type, { requestId: options.requestId })).row;
        assert.equal(
          (await request('start', type, options)).response.status,
          200
        );
        assert.equal((await waitFor(status, 'prepared')).providerSaved, false);
        assert.equal(
          (
            await request('decide', type, {
              ...options,
              planRequestId: 'wrong',
              decision: choice,
            })
          ).response.status,
          409
        );
        assert.equal(
          (await request('decide', type, { ...options, decision: choice }))
            .response.status,
          200
        );
        const row = await waitFor(status, phase);
        assert.equal(row.providerSaved, phase === 'saved');
        if (row.providerSaved) {
          assert.deepEqual(row.save.exports, [
            { hash: identity.hash, sha256: 'a'.repeat(64) },
          ]);
        }
      }
      assert.deepEqual(events, ['about', 'about', 'skip', 'about', 'save']);
      const replay = { ...input, requestId: 'about-replay' };
      await request('start', LINO_BINARY, replay);
      assert.equal(
        (
          await waitFor(
            async () =>
              (
                await request('status', LINO_BINARY, {
                  requestId: replay.requestId,
                })
              ).row,
            'failed'
          )
        ).code,
        'cv-hh-workplace-attempted'
      );
      assert.equal(events.length, 5);
    } finally {
      await app.close();
      await fixture.close();
    }
  }
);
