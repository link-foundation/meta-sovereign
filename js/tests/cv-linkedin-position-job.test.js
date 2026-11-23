import assert from 'node:assert/strict';
import path from 'node:path';
import { Readable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import {
  linkedinPositionReference,
  linkedinPositionReviewFixture,
} from '../../experiments/issue-56/linkedin-position-review-fixture.mjs';
import { foregroundLinkedinPosition } from '../src/cli/cv-linkedin-position-foreground.js';
import { saveBrowserPolicy } from '../src/browser/policy.js';
import { createLinkedinPositionNative } from '../src/cv/linkedin-position-native.js';
import {
  createLinkedinPositionJobs,
  readLinkedinPositionJob,
} from '../src/cv/linkedin-position-job.js';
import { createLinkedinPositionReviews } from '../src/cv/linkedin-position-review.js';
import { startServer } from '../src/server/index.js';
import {
  LINO_BINARY,
  LINO_TEXT,
  encodeWire,
  readWireResponse,
} from '../src/transport/lino.js';

test('LinkedIn position review honors the configured persistent browser slot visibility', async () => {
  const fixture = await linkedinPositionReviewFixture();
  const ended = new Error('Stop before opening a provider page');
  const launches = [];
  const prepare = createLinkedinPositionNative({
    store: fixture.store,
    profileDir: path.join(fixture.dir, 'visibility'),
    openSession: async (options) => {
      launches.push([options.slot, options.persistent, options.headless]);
      throw ended;
    },
  });
  const plan = {
    browserSlot: 'linkedin-experience',
    target: { language: 'en' },
  };
  try {
    await assert.rejects(prepare(plan), ended);
    await saveBrowserPolicy(fixture.store, {
      scope: 'slot',
      key: 'linkedin/linkedin-experience',
      headless: true,
    });
    await assert.rejects(prepare(plan), ended);
    assert.deepEqual(launches, [
      ['linkedin-experience', true, false],
      ['linkedin-experience', true, true],
    ]);
  } finally {
    await fixture.close();
  }
});

test('LinkedIn foreground requires an explicit choice and leaves the draft open on EOF', async () => {
  const input = { requestId: 'fixture-job', fingerprint: 'a'.repeat(64) };
  for (const [line, expected, phase] of [
    ['yes\n', 'stop', 'stopped'],
    ['q\n', 'stop', 'stopped'],
    ['y\n', 'save', 'saved'],
    ['s\n', 'skip', 'skipped'],
  ]) {
    const calls = [];
    let status = { phase: 'prepared', unapplied: ['skills'] };
    const service = {
      start: async () => status,
      status: async () => status,
      stop: async (row) => {
        assert.deepEqual(row, { requestId: input.requestId });
        calls.push('stop');
        status = { phase: 'stopped' };
      },
      decide: async (row) => {
        assert.deepEqual(row, { ...input, decision: expected });
        calls.push(row.decision);
        status = { phase };
      },
    };
    const messages = [];
    const result = await foregroundLinkedinPosition(service, input, {
      stdin: Readable.from([line]),
      notice: (message) => messages.push(message),
      wait: () => delay(1),
    });
    assert.equal(result.phase, phase);
    assert.deepEqual(calls, [expected]);
    assert.match(messages.join('\n'), /Manual review required for skills/u);
  }
});

test('LinkedIn start is acknowledged before opening and HTTP decisions require the active review', async () => {
  const fixture = await linkedinPositionReviewFixture();
  const { store, artifactRoot } = fixture;
  const reviews = createLinkedinPositionReviews(fixture);
  const draft = await reviews.stage(
    linkedinPositionReference(fixture.row, 'update')
  );
  const approved = await reviews.review({ fingerprint: draft.fingerprint });
  const input = {
    requestId: 'position-approved',
    fingerprint: approved.fingerprint,
  };
  let opens = 0;
  const open = async (_plan, signal) => {
    opens++;
    await delay(10000, undefined, { signal });
    assert.fail('Stop should release this opening job');
  };
  const jobs = createLinkedinPositionJobs({ ...fixture, open });
  const flush = store.flush;
  try {
    store.flush = async () => {
      throw new Error('Fixture refused job flush');
    };
    await assert.rejects(jobs.start(input), /refused job flush/u);
    assert.equal(opens, 0);
  } finally {
    store.flush = flush;
    await jobs.close();
  }
  const server = await startServer({
    port: 0,
    store,
    cv: { experience: { artifactRoot, position: { open } } },
    enableHandlers: false,
    enableSync: false,
    telegramAccount: false,
    automations: { scheduler: false },
  });
  try {
    const base = `http://127.0.0.1:${server.port}/api/cv/experience/linkedin-position-`;
    const call = (operation, body, type, origin) =>
      fetch(`${base}${operation}`, {
        method: body ? 'POST' : 'GET',
        headers: {
          accept: type,
          ...(body && { 'content-type': type }),
          ...(origin && { origin }),
        },
        body: body ? encodeWire(body, type) : undefined,
      });
    const status = async (requestId, type) => {
      const response = await call(`status?requestId=${requestId}`, null, type);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      return readWireResponse(response);
    };
    const refused = {
      ...input,
      requestId: 'position-draft',
      fingerprint: draft.fingerprint,
    };
    await call('start', refused, LINO_TEXT);
    let rejection;
    for (let count = 0; count < 50; count++) {
      rejection = await status(refused.requestId, LINO_TEXT);
      if (rejection.phase === 'failed') {
        break;
      }
      await delay(5);
    }
    assert.equal(rejection.code, 'cv-linkedin-position-review');
    assert.equal(opens, 0);
    const started = await call('start', input, LINO_BINARY);
    assert.equal(started.status, 200);
    assert.equal((await readWireResponse(started)).phase, 'opening');
    for (let count = 0; opens === 0 && count < 100; count++) {
      await delay(5);
    }
    assert.equal(opens, 1);
    assert.equal((await status(input.requestId, LINO_TEXT)).phase, 'opening');
    assert.equal(
      (await readLinkedinPositionJob(store, input)).phase,
      'unknown'
    );
    const decision = { ...input, decision: 'save' };
    assert.equal(
      (await call('decide', decision, LINO_BINARY, 'https://untrusted.example'))
        .status,
      403
    );
    const early = await call('decide', decision, LINO_TEXT);
    assert.equal(early.status, 400);
    assert.equal(
      (await readWireResponse(early)).code,
      'cv-linkedin-position-decision'
    );
    const stopped = await call(
      'stop',
      { requestId: input.requestId },
      LINO_TEXT
    );
    assert.equal((await readWireResponse(stopped)).phase, 'stopped');
    const replay = await call('start', input, LINO_BINARY);
    assert.equal((await readWireResponse(replay)).providerSaved, false);
    assert.equal(opens, 1);
  } finally {
    await server.close();
    await fixture.close();
  }
});
