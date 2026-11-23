import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  setImmediate as tick,
  setTimeout as delay,
} from 'node:timers/promises';
import { createCvCommands } from '../src/cli/cv-commands.js';
import {
  createHhExperienceAcquisition,
  hhAcquisitionRunning,
  storedHhAcquisitionStatus,
} from '../src/cv/experience-hh-acquisition.js';
import { storedExperienceDocument } from '../src/cv/experience-store.js';
import { createVacancyService } from '../src/jobs/service.js';
import { LINO_BINARY, LINO_TEXT } from '../src/transport/lino.js';
import {
  cvFixtureRequest,
  startCvFixtureServer,
} from '../../experiments/issue-56/cv-fixture-server.mjs';
import { technologyFixture } from '../../experiments/issue-56/technology-fixture.mjs';
import { gate } from '../../experiments/issue-56/vacancy-fixture.mjs';

const finished = async (service, input) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    const row = await service.status(input);
    if (!hhAcquisitionRunning(row)) {
      return row;
    }
    await delay(10);
  }
  throw new Error('Acquisition never reached a terminal state.');
};

test(
  'cache reuse is exact, repeated IDs are read-only, and corrupted artifacts never launch a replacement',
  { timeout: 5000 },
  async () => {
    const fixture = await technologyFixture();
    let launches = 0;
    const service = createHhExperienceAcquisition({
      ...fixture,
      getVacancies: () => {
        launches++;
        throw new Error('Native export would open a browser');
      },
    });
    const explicit = { requestId: 'exact', hash: fixture.input.hash };
    try {
      assert.equal((await service.start(explicit)).phase, 'checking-cache');
      const row = await finished(service, explicit);
      assert.deepEqual(row.result, {
        ...fixture.input,
        source: 'cached',
        revision: row.result.revision,
      });
      assert.deepEqual(await service.start(explicit), row);
      await assert.rejects(service.start({ ...explicit, refresh: true }), {
        code: 'cv-hh-acquisition-conflict',
      });
      const latest = { requestId: 'latest' };
      await service.start(latest);
      assert.deepEqual((await finished(service, latest)).result, row.result);
      const document = await storedExperienceDocument(
        fixture.store,
        row.result.revision
      );
      assert.deepEqual(document.document.jobs[0].skills, ['npm', 'PostgreSQL']);
      assert.equal(document.document.profile.about, fixture.cv.about);
      assert.deepEqual(document.document.jobs[0].native, fixture.cv.jobs[0]);
      await writeFile(join(fixture.folder, 'resume.json'), '{}');
      const corrupt = { ...explicit, requestId: 'corrupt' };
      await service.start(corrupt);
      assert.equal((await finished(service, corrupt)).phase, 'failed');
      assert.equal(launches, 0);
      assert.deepEqual(
        await storedHhAcquisitionStatus(fixture.store, explicit),
        row
      );
    } finally {
      await service.close();
      await fixture.close();
    }
  }
);

test(
  'Lino acquisition starts one existing Jobs export per miss or explicit refresh and selects the newly verified revision',
  { timeout: 10000 },
  async () => {
    const fixture = await technologyFixture();
    const calls = [];
    const server = await startCvFixtureServer({
      store: fixture.store,
      vacancies: {
        artifactRoot: fixture.artifactRoot,
        readResumeExports: async (options, progress) => {
          calls.push(options);
          const result = {
            ...fixture.receipt,
            exportId: `ab00000${calls.length}-0123-4567-89ab-000000000000`,
            hash: options.resume,
            browserSlot: options.browserSlot,
          };
          const folder = join(
            fixture.artifactRoot,
            result.exportId,
            result.hash
          );
          await mkdir(folder, { recursive: true });
          await copyFile(
            join(fixture.folder, 'resume.json'),
            join(folder, 'resume.json')
          );
          for (const id of [
            `jobs-resume-artifact:${result.exportId}:${result.hash}`,
            `jobs-resume-export:${result.browserSlot}:${result.hash}`,
          ]) {
            await fixture.store.put({ id, version: 1, ...result });
          }
          await progress({ total: 1 });
          await progress({ result });
        },
      },
    });
    try {
      const send = cvFixtureRequest(
        `http://127.0.0.1:${server.port}/api/cv/experience/`,
        ['hh-status', 'document']
      );
      let previous;
      for (const [index, type] of [
        LINO_TEXT,
        LINO_BINARY,
        LINO_TEXT,
      ].entries()) {
        const input = index
          ? {
              hash: fixture.input.hash,
              browserSlot: 'jobs',
              refresh: index === 1,
            }
          : { hash: 'no-cached-export', browserSlot: 'fixture-slot' };
        if (index === 2) {
          await unlink(
            join(
              fixture.artifactRoot,
              previous.exportId,
              previous.hash,
              'resume.json'
            )
          );
        }
        const request = { requestId: `owner-${index}`, ...input };
        const refused = await send(
          'hh-start',
          type,
          request,
          'https://untrusted.invalid'
        );
        assert.equal(refused.response.status, 403);
        assert.equal(calls.length, index);
        const started = await send('hh-start', type, request);
        assert.equal(started.response.status, 200);
        assert.equal(
          started.response.headers.get('cache-control'),
          'private, no-store'
        );
        assert.equal(started.row.phase, 'checking-cache');
        const status = async ({ requestId }) =>
          (await send('hh-status', type, { requestId })).row;
        const terminal = await finished({ status }, request);
        assert.equal(terminal.phase, 'completed');
        assert.equal(terminal.result.source, 'native');
        assert.equal(terminal.result.hash, input.hash);
        assert.equal(terminal.result.browserSlot, input.browserSlot);
        assert.notEqual(terminal.result.exportId, fixture.input.exportId);
        assert.notEqual(terminal.result.exportId, previous?.exportId);
        previous = terminal.result;
        const read = await send('document', type, {
          revision: terminal.result.revision,
        });
        assert.equal(
          read.row.provenance.identity.exportId,
          terminal.result.exportId
        );
        assert.equal(read.row.provenance.identity.hash, input.hash);
        assert.deepEqual((await send('hh-start', type, request)).row, terminal);
        assert.deepEqual(calls[index].formats, ['html']);
        assert.equal(calls.length, index + 1);
      }
    } finally {
      await server.close();
      await fixture.close();
    }
  }
);

test(
  'Stop drains only its Jobs export and interrupted status never reopens the browser',
  { timeout: 5000 },
  async () => {
    const fixture = await technologyFixture();
    const entered = gate(),
      draining = gate(),
      release = gate();
    const jobs = createVacancyService({
      store: fixture.store,
      readResumeExports: async ({ signal }) => {
        entered.resolve();
        if (!signal.aborted) {
          await new Promise((resolve) =>
            signal.addEventListener('abort', resolve, { once: true })
          );
        }
        draining.resolve();
        await release.promise;
        signal.throwIfAborted();
      },
    });
    let invoked = 0;
    const config = {
      ...fixture,
      getVacancies: () => {
        invoked++;
        return jobs;
      },
    };
    const service = createHhExperienceAcquisition(config);
    const interrupted = createHhExperienceAcquisition(config);
    const request = { requestId: 'stop-own-export', refresh: true };
    try {
      const tombstone = { requestId: 'previously-unreceived' };
      assert.equal((await service.stop(tombstone)).phase, 'stopped');
      assert.equal((await service.start(tombstone)).phase, 'stopped');
      await service.start(request);
      await entered.promise;
      assert.equal(
        (await storedHhAcquisitionStatus(fixture.store, request)).phase,
        'unknown'
      );
      assert.equal((await interrupted.status(request)).phase, 'interrupted');
      assert.equal((await interrupted.start(request)).phase, 'interrupted');
      const stop = service.stop(request);
      await draining.promise;
      assert.equal(invoked, 1);
      assert.equal(
        (await storedHhAcquisitionStatus(fixture.store, request)).lastPhase,
        'exporting'
      );
      release.resolve();
      assert.equal((await stop).phase, 'stopped');
      assert.equal((await service.start(request)).phase, 'stopped');
      assert.equal(invoked, 1);
    } finally {
      release.resolve();
      await service.close();
      await interrupted.close();
      await jobs.stop();
      await fixture.close();
    }
  }
);

test(
  'CLI foreground cache acquisition and readonly recovery leave Jobs unstarted',
  { timeout: 5000 },
  async () => {
    const fixture = await technologyFixture();
    let readOnly = 0;
    let opened = 0;
    const commands = createCvCommands({
      openStore: async () => {
        opened++;
        return fixture.store;
      },
      openReadOnly: async () => {
        readOnly++;
        return fixture.store;
      },
      live: {
        hhExperience: {
          vacancies: { artifactRoot: fixture.artifactRoot },
          foregroundWait: tick,
        },
      },
    });
    try {
      const input = { 'request-id': 'cli-owner', 'refresh-hh': 'false' };
      const output = [];
      for (const operation of ['start', 'status']) {
        assert.equal(
          await commands[`cv-experience-hh-${operation}`](input, (text) =>
            output.push(JSON.parse(text))
          ),
          0
        );
      }
      assert.equal(output[0].result.source, 'cached');
      assert.deepEqual(output[0], output[1]);
      assert.equal(opened, 1);
      assert.equal(readOnly, 1);
      assert.deepEqual(
        await fixture.store.query((row) =>
          row.id.startsWith('jobs-resume-request:')
        ),
        []
      );
    } finally {
      await fixture.close();
    }
  }
);
