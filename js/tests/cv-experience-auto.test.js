import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { createCvCommands } from '../src/cli/cv-commands.js';
import {
  createExperienceAutoService,
  storedExperienceAutoStatus,
} from '../src/cv/experience-auto-service.js';
import { createHhExperienceAcquisition } from '../src/cv/experience-hh-acquisition.js';
import {
  experienceAutoChildId,
  experienceAutoKey,
  experienceAutoRunning,
} from '../src/cv/experience-auto-record.js';
import { linkedinExportKey } from '../src/cv/linkedin-experience-record.js';
import { confirmedExperiencePlan } from '../src/cv/experience-plan-receipt.js';
import { experiencePlanKey } from '../src/cv/experience-plan-record.js';
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
  'automatic preparation recovers the original options after its comparison completed',
  { timeout: 10000 },
  async () => {
    const fixture = await experienceAutoFixture();
    const { store } = fixture;
    const server = await startCvFixtureServer({
      store,
      vacancies: fixture.vacancies,
      cv: fixture.cv,
    });
    const send = cvFixtureRequest(
      `http://127.0.0.1:${server.port}/api/cv/experience/`,
      ['auto-status']
    );
    try {
      const request = { requestId: 'recover-automatic-comparison' };
      const input = { ...fixture.input, ...request };
      const status = async (type) =>
        (await send('auto-status', type, request)).row;
      await send('auto-start', LINO_TEXT, input);
      const result = await settled(() => status(LINO_TEXT));
      assert.equal(result.phase, 'completed');
      const id = experienceAutoKey(request.requestId);
      const row = await store.get(id);
      const checkpoint = { ...row, phase: 'planning', plan: null };
      const translated = fixture.translationCalls.length;
      assert.ok(translated > 0);
      await store.put(checkpoint);
      assert.deepEqual(await status(LINO_TEXT), result);
      assert.deepEqual(await status(LINO_BINARY), result);
      assert.deepEqual(
        await storedExperienceAutoStatus(store, request),
        result
      );
      assert.deepEqual(
        (await send('auto-start', LINO_BINARY, input)).row,
        result
      );
      assert.deepEqual(await store.get(id), checkpoint);

      const mismatch = {
        ...checkpoint,
        options: { ...row.options, asOf: '2026-10' },
      };
      await store.put(mismatch);
      assert.equal((await status(LINO_TEXT)).phase, 'interrupted');
      assert.equal(
        (await storedExperienceAutoStatus(store, request)).phase,
        'unknown'
      );
      assert.deepEqual(await store.get(id), mismatch);
      assert.equal(fixture.calls.length, 1);
      assert.equal(fixture.translationCalls.length, translated);
    } finally {
      await server.close();
      await fixture.close();
    }
  }
);

test(
  'explicit preparation recovery retains acknowledged snapshots and refuses unconfirmed children',
  { timeout: 10000 },
  async () => {
    const fixture = await experienceAutoFixture();
    const { store } = fixture;
    const server = await startCvFixtureServer({
      store,
      vacancies: fixture.vacancies,
      cv: fixture.cv,
    });
    const send = cvFixtureRequest(
      `http://127.0.0.1:${server.port}/api/cv/experience/`,
      ['auto-status']
    );
    try {
      const request = { requestId: 'recover-native-acquisition' };
      const input = { ...fixture.input, ...request };
      const status = async () =>
        (await send('auto-status', LINO_TEXT, request)).row;
      await send('auto-start', LINO_TEXT, input);
      const result = await settled(status);
      assert.equal(result.phase, 'completed');
      const id = experienceAutoKey(request.requestId);
      const row = await store.get(id);
      const child = experienceAutoChildId(row.token, 'linkedin');
      const linkedinKey = linkedinExportKey(child);
      const planKey = experiencePlanKey(result.plan.requestId);
      const checkpoint = {
        ...row,
        phase: 'acquiring-hh',
        hh: null,
        linkedin: null,
        plan: null,
      };
      await store.put(checkpoint);
      await store.delete(linkedinKey);
      await store.delete(planKey);
      const interrupted = await status();
      assert.equal(interrupted.phase, 'interrupted');
      assert.equal(interrupted.recoveryAvailable, true);
      assert.deepEqual(
        (await send('auto-start', LINO_BINARY, input)).row,
        interrupted
      );
      assert.equal(fixture.calls.length, 1);
      assert.deepEqual(await store.get(id), checkpoint);

      assert.equal(
        (
          await send(
            'auto-resume',
            LINO_BINARY,
            request,
            'https://untrusted.example'
          )
        ).response.status,
        403
      );
      assert.equal(
        (await send('auto-resume', LINO_BINARY, request)).response.status,
        200
      );
      const complete = await settled(status);
      assert.equal(complete.phase, 'completed');
      assert.equal(complete.hh, result.hh);
      assert.equal(complete.linkedin, result.linkedin);
      assert.equal(complete.plan.requestId, result.plan.requestId);
      assert.deepEqual(fixture.calls, [child, child]);
      assert.deepEqual(
        (await send('auto-resume', LINO_TEXT, request)).row,
        complete
      );

      const acknowledged = await store.get(linkedinKey);
      const comparison = await store.get(planKey);
      const translations = fixture.translationCalls.length;
      await store.put({ ...comparison, phase: 'translating' });
      await store.put({ ...row, phase: 'planning', plan: null });
      assert.equal((await status()).recoveryAvailable, false);
      assert.equal(
        (await send('auto-resume', LINO_TEXT, request)).response.status,
        409
      );
      assert.equal(fixture.translationCalls.length, translations);
      await store.put({
        ...acknowledged,
        phase: 'reading',
        revision: null,
        files: [],
      });
      const uncertain = {
        ...checkpoint,
        phase: 'acquiring-linkedin',
        hh: row.hh,
      };
      await store.put(uncertain);
      await store.delete(planKey);
      assert.equal((await status()).recoveryAvailable, false);
      const refused = await send('auto-resume', LINO_TEXT, request);
      assert.equal(refused.response.status, 409);
      assert.deepEqual(await store.get(id), uncertain);
      await store.delete(linkedinKey);
      const missingAfterProgress = { ...uncertain, step: 'reading' };
      await store.put(missingAfterProgress);
      assert.equal((await status()).recoveryAvailable, false);
      assert.equal(
        (await send('auto-resume', LINO_TEXT, request)).response.status,
        409
      );
      assert.deepEqual(await store.get(id), missingAfterProgress);
      assert.deepEqual(fixture.calls, [child, child]);
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
  'foreground CLI reads status without ownership and explicitly resumes with the original snapshots',
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
        return Object.create(fixture.store);
      },
      openReadOnly: async () => {
        opened.push('read');
        return Object.create(fixture.store);
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
      const id = experienceAutoKey(args['request-id']);
      const row = await fixture.store.get(id);
      await fixture.store.put({
        ...row,
        phase: 'acquiring-linkedin',
        step: 'waiting-login',
        linkedin: null,
        plan: null,
      });
      await fixture.store.delete(experiencePlanKey(row.plan.requestId));
      assert.equal(await commands['cv-experience-auto-status'](args, log), 0);
      assert.equal(JSON.parse(output.at(-1)).phase, 'unknown');
      assert.equal(
        await commands['cv-experience-auto-resume'](
          { 'request-id': args['request-id'] },
          log
        ),
        0,
        JSON.stringify(output.slice(-2))
      );
      const resumed = JSON.parse(output.at(-1));
      assert.equal(resumed.phase, 'completed');
      assert.equal(resumed.hh, start.hh);
      assert.equal(resumed.linkedin, start.linkedin);
      assert.equal(resumed.plan.requestId, start.plan.requestId);
      assert.deepEqual(opened, ['write', 'read', 'read', 'write']);
      assert.equal(fixture.calls.length, 1);
    } finally {
      await fixture.close();
    }
  }
);
