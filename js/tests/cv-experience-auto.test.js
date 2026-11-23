import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { createCvCommands } from '../src/cli/cv-commands.js';
import {
  createExperienceAutoService,
  storedExperienceAutoStatus,
} from '../src/cv/experience-auto-service.js';
import { createHhExperienceAcquisition } from '../src/cv/experience-hh-acquisition.js';
import { experienceAutoRunning } from '../src/cv/experience-auto-record.js';
import { confirmedExperiencePlan } from '../src/cv/experience-plan-receipt.js';
import { LINO_BINARY, LINO_TEXT } from '../src/transport/lino.js';
import { experienceAutoFixture } from '../../experiments/issue-56/experience-auto-fixture.mjs';
import {
  cvFixtureRequest,
  startCvFixtureServer,
} from '../../experiments/issue-56/cv-fixture-server.mjs';
import { gate } from '../../experiments/issue-56/vacancy-fixture.mjs';

const settled = async (status) => {
  for (let attempt = 0; attempt < 160; attempt++) {
    const row = await status();
    if (!experienceAutoRunning(row)) {
      return row;
    }
    await delay(10);
  }
  throw new Error('Automatic preparation did not settle.');
};

test(
  'both wire encodings acquire exact native snapshots and retain the directed comparison by request ID',
  { timeout: 10000 },
  async () => {
    const fixture = await experienceAutoFixture();
    const server = await startCvFixtureServer({
      store: fixture.store,
      vacancies: fixture.vacancies,
      cv: fixture.cv,
    });
    const send = cvFixtureRequest(
      `http://127.0.0.1:${server.port}/api/cv/experience/`,
      ['auto-status', 'document', 'plan-status']
    );
    try {
      for (const [index, type] of [LINO_TEXT, LINO_BINARY].entries()) {
        const input = {
          ...fixture.input,
          to: index ? 'hh' : 'linkedin',
          requestId: `auto-${index}`,
        };
        const request = { requestId: input.requestId };
        assert.equal(
          (await send('auto-start', type, input, 'https://untrusted.example'))
            .response.status,
          403
        );
        assert.equal(fixture.calls.length, index);
        const start = await send('auto-start', type, input);
        assert.equal(start.response.status, 200);
        assert.equal(
          start.response.headers.get('cache-control'),
          'private, no-store'
        );
        assert.equal(start.row.phase, 'acquiring-hh');
        const result = await settled(
          async () => (await send('auto-status', type, request)).row
        );
        assert.equal(result.phase, 'completed', JSON.stringify(result));
        const hh = (await send('document', type, { revision: result.hh })).row;
        const linkedin = (
          await send('document', type, { revision: result.linkedin })
        ).row;
        assert.equal(
          hh.provenance.identity.exportId,
          fixture.input.exportId ?? fixture.receipt.exportId
        );
        assert.equal(linkedin.provenance.requestId, fixture.calls[index]);
        const plan = await confirmedExperiencePlan(
          (
            await send('plan-status', type, {
              requestId: result.plan.requestId,
            })
          ).row,
          result.plan.requestId
        );
        assert.equal(plan.fingerprint, result.plan.fingerprint);
        assert.equal(plan.options.hh, result.hh);
        assert.equal(plan.options.linkedin, result.linkedin);
        assert.equal(plan.options.to, input.to);
        assert.equal(plan.providerSaved, false);
        assert.ok(plan.plan.translations.length > 0);
        const comparisons = fixture.translationCalls.length;
        assert.deepEqual(
          (await send('auto-status', type, request)).row,
          result
        );
        assert.deepEqual((await send('auto-start', type, input)).row, result);
        assert.equal(
          (await send('auto-start', type, { ...input, refresh: true })).response
            .status,
          409
        );
        assert.deepEqual((await send('auto-stop', type, request)).row, result);
        assert.equal(fixture.calls.length, index + 1);
        assert.equal(fixture.translationCalls.length, comparisons);
      }
    } finally {
      await server.close();
      await fixture.close();
    }
  }
);

test(
  'Stop drains only the identified child and retains the completed HeadHunter checkpoint',
  { timeout: 5000 },
  async () => {
    const fixture = await experienceAutoFixture();
    const hh = createHhExperienceAcquisition({
      ...fixture,
      getVacancies: () =>
        assert.fail('The exact cached export should be reused'),
    });
    const waiting = gate();
    const draining = gate();
    const release = gate();
    let input;
    let stops = 0;
    let completedStop = false;
    const options = {
      store: fixture.store,
      getHh: () => hh,
      getLinkedin: () => ({
        start: async (options) => {
          input = options;
          return {
            requestId: options.requestId,
            options,
            phase: 'waiting-login',
          };
        },
        status: async ({ requestId }) => {
          assert.equal(requestId, input.requestId);
          return { requestId, options: input, phase: 'waiting-login' };
        },
        stop: async ({ requestId }) => {
          assert.equal(requestId, input.requestId);
          stops++;
          draining.resolve();
          await release.promise;
        },
      }),
      getPlan: () => assert.fail('A stopped read cannot start planning'),
      wait: async (signal) => {
        if (input) {
          waiting.resolve();
        }
        await delay(10, null, { signal });
      },
    };
    const service = createExperienceAutoService(options);
    const restarted = createExperienceAutoService(options);
    const request = { requestId: 'waiting-for-owner' };
    try {
      await service.start({ ...fixture.input, ...request });
      await waiting.promise;
      const persisted = await storedExperienceAutoStatus(
        fixture.store,
        request
      );
      assert.equal(persisted.phase, 'unknown');
      assert.equal(persisted.step, 'waiting-login');
      assert.equal((await restarted.status(request)).phase, 'interrupted');
      assert.equal(
        (await restarted.start({ ...fixture.input, ...request })).phase,
        'interrupted'
      );
      await service.stop({ requestId: 'unrelated' });
      assert.equal(stops, 0);
      const stop = service.stop(request).then((value) => {
        completedStop = true;
        return value;
      });
      await draining.promise;
      assert.equal(completedStop, false);
      release.resolve();
      const stopped = await stop;
      assert.equal(stopped.phase, 'stopped');
      assert.equal(stopped.hh, persisted.hh);
      assert.equal(stopped.linkedin, null);
      assert.equal(stopped.plan, null);
      assert.equal(stops, 1);
    } finally {
      release.resolve();
      await service.close();
      await restarted.close();
      await hh.close();
      await fixture.close();
    }
  }
);

test(
  'foreground CLI recovers its receipt with a read-only store and does not start another acquisition',
  { timeout: 5000 },
  async () => {
    const fixture = await experienceAutoFixture();
    const opened = [];
    const args = {
      url: fixture.input.url,
      language: fixture.input.language,
      to: fixture.input.to,
      'request-id': 'cli-auto',
    };
    const commands = createCvCommands({
      openStore: async () => {
        opened.push('write');
        return fixture.store;
      },
      openReadOnly: async () => {
        opened.push('read');
        return fixture.store;
      },
      live: {
        ...fixture.cv,
        hhExperience: { vacancies: fixture.vacancies },
        experienceAuto: {
          wait: (signal) => delay(1, null, { signal }),
          foregroundWait: () => delay(1),
          notice: () => {},
        },
      },
    });
    try {
      const output = [];
      const log = (text) => output.push(text);
      assert.equal(
        await commands['cv-experience-auto-start'](args, log),
        0,
        JSON.stringify(output)
      );
      assert.equal(await commands['cv-experience-auto-status'](args, log), 0);
      const [start, status] = output.map(JSON.parse);
      assert.equal(start.phase, 'completed');
      assert.deepEqual(start, status);
      assert.deepEqual(opened, ['write', 'read']);
      assert.equal(fixture.calls.length, 1);
    } finally {
      await fixture.close();
    }
  }
);
