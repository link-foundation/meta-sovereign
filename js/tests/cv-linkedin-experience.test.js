import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as cv from '../src/cv/index.js';
import { createLinkedinExperienceService } from '../src/cv/linkedin-experience-service.js';
import {
  linkedinExportKey,
  newLinkedinExport,
  checkedLinkedinExport,
} from '../src/cv/linkedin-experience-record.js';
import { storedExperienceDocument } from '../src/cv/experience-store.js';
import { privateSyncId } from '../src/sync/reconcile-records.js';
import { saveBrowserPolicy } from '../src/browser/policy.js';
import {
  linkedinReaderFixture,
  linkedinExperienceRaw,
  linkedinExportInput,
} from '../../experiments/issue-56/linkedin-experience-fixture.mjs';
import { settledLinkedinFixture } from '../../experiments/issue-56/linkedin-export-settled.mjs';

const settled = (service, requestId) =>
  settledLinkedinFixture(() => service.status({ requestId }));

test('public native LinkedIn parser preserves separate grouped roles, native links and year-only dates', () => {
  assert.equal(typeof cv.linkedinExperienceDocument, 'function');
  const document = cv.linkedinExperienceDocument(
    linkedinExperienceRaw(),
    linkedinExportInput(),
    '2026-11-16T00:00:00.000Z'
  );
  assert.equal(document.jobs.length, 2);
  assert.deepEqual(
    document.jobs.map((job) => [job.company, job.title, job.start, job.end]),
    [
      ['Fixture Company', 'Lead engineer', '2023-01', null],
      ['Fixture Company', 'Engineer', '2020', '2022-12'],
    ]
  );
  assert.deepEqual(document.jobs[0].skills, ['Rust']);
  assert.deepEqual(document.jobs[0].media, [
    { url: 'https://example.test/demo', title: 'Demo' },
  ]);
  assert.deepEqual(
    document.jobs[1].native.marks,
    linkedinExperienceRaw().items[0].roles[1].marks
  );
  const credentialUrl = new URL(linkedinExportInput().url);
  credentialUrl.username = 'fixture-owner';
  credentialUrl.password = 'fixture-password';
  for (const url of [
    'https://www.linkedin.com.attacker.test/in/a/details/experience/',
    'https://www.linkedin.com/in/a/details/experience/?extra=1',
    credentialUrl.href,
  ]) {
    assert.throws(() => cv.linkedinExperienceUrl(url));
  }
  for (const patch of [
    { items: [] },
    { items: [{ unparsed: true }] },
    { url: 'https://www.linkedin.com/login' },
  ]) {
    assert.throws(() =>
      cv.linkedinExperienceDocument(
        { ...linkedinExperienceRaw(), ...patch },
        linkedinExportInput(),
        '2026-11-16T00:00:00.000Z'
      )
    );
  }
});

test('native reader loads once in its separate visible persistent slot and writes four private hashed files', async () => {
  const fixture = await linkedinReaderFixture();
  try {
    const result = await fixture.read(linkedinExportInput());
    const opened = fixture.calls.find(([name]) => name === 'open')[1];
    assert.equal(opened.headless, false);
    assert.equal(opened.persistent, true);
    assert.equal(opened.slot, 'linkedin-experience');
    assert.equal(fixture.calls.filter(([name]) => name === 'goto').length, 1);
    assert.equal(fixture.calls.filter(([name]) => name === 'detach').length, 1);
    assert.equal(result.files.length, 4);
    assert.ok(
      result.files.every((file) => /^[a-f0-9]{64}$/u.test(file.sha256))
    );
    const evidence = JSON.parse(
      await readFile(
        path.join(
          fixture.artifactRoot,
          linkedinExportInput().requestId,
          'linkedin-experience.json'
        )
      )
    );
    assert.deepEqual(evidence.items, linkedinExperienceRaw().items);
    assert.equal(evidence.traversal.boundary, 'rendered-bottom');
    assert.equal(JSON.stringify(evidence).includes('li_at'), false);
    await result.discard();
    assert.deepEqual(await readdir(fixture.artifactRoot), []);
  } finally {
    await fixture.close();
  }
});

test('manual login waits at most 30 minutes and never reads session-cookie values', async () => {
  let time = Date.UTC(2026, 10, 16);
  let waits = 0;
  const fixture = await linkedinReaderFixture({
    cookies: [],
    now: () => time,
    wait: async () => {
      waits++;
      time += 600000;
    },
  });
  const phases = [];
  try {
    await assert.rejects(
      fixture.read(linkedinExportInput(), async (phase) => phases.push(phase)),
      { code: 'cv-linkedin-login-timeout' }
    );
    assert.equal(waits, 3);
    assert.deepEqual(phases, ['opening', 'waiting-login']);
    assert.equal(
      fixture.calls.some(([name]) => name === 'readLinkedinExperienceDocument'),
      false
    );
    assert.equal(fixture.calls.at(-1)[0], 'detach');
  } finally {
    await fixture.close();
  }
});

test('the fixed LinkedIn slot honors configured headless mode and refuses unavailable manual login', async () => {
  const fixture = await linkedinReaderFixture({ cookies: [] });
  try {
    await saveBrowserPolicy(fixture.store, {
      scope: 'slot',
      key: 'linkedin/linkedin-experience',
      headless: true,
    });
    await assert.rejects(fixture.read(linkedinExportInput()), {
      code: 'cv-linkedin-login-required',
    });
    assert.equal(
      fixture.calls.find(([name]) => name === 'open')[1].headless,
      true
    );
    assert.equal(
      fixture.calls.some(([name]) => name === 'readLinkedinExperienceDocument'),
      false
    );
    assert.equal(fixture.calls.at(-1)[0], 'detach');
  } finally {
    await fixture.close();
  }
});

test('existing drafts, unknown markup, reordered cards and bounded unfinished traversal refuse completion', async () => {
  let scans = 0;
  for (const options of [
    { gate: () => ({ draft: true, wall: false }) },
    { advance: () => ({ ambiguous: true, clicked: 0 }) },
    { raw: () => ({ ...linkedinExperienceRaw(), bottom: false }) },
    {
      raw: () => {
        const raw = linkedinExperienceRaw();
        if (scans++) {
          raw.items[0].parent.title = 'Replaced';
        }
        return raw;
      },
    },
    {
      raw: () => ({ ...linkedinExperienceRaw(), items: [{ unparsed: true }] }),
    },
  ]) {
    const fixture = await linkedinReaderFixture(options);
    try {
      await assert.rejects(fixture.read(linkedinExportInput()));
      assert.equal(fixture.calls.at(-1)[0], 'detach');
      assert.ok(
        fixture.calls.filter(
          ([name]) => name === 'readLinkedinExperienceDocument'
        ).length <= 40
      );
      if (options.gate) {
        assert.equal(
          fixture.calls.some(([name]) => name === 'goto'),
          false
        );
      }
    } finally {
      await fixture.close();
    }
  }
});

test('late browser creation is drained on Stop and detach failure removes unacknowledged files', async () => {
  const controller = new AbortController();
  for (const options of [
    { open: async () => controller.abort() },
    {
      detach: async () => {
        throw new Error('detach failed');
      },
    },
  ]) {
    const fixture = await linkedinReaderFixture(options);
    try {
      await assert.rejects(
        fixture.read({
          ...linkedinExportInput(),
          ...(options.open ? { signal: controller.signal } : {}),
        })
      );
      assert.equal(fixture.calls.at(-1)[0], 'detach');
      assert.deepEqual(await readdir(fixture.artifactRoot).catch(() => []), []);
    } finally {
      await fixture.close();
    }
  }
});

test('acknowledged native export recovers without browser replay and verifies evidence bytes', async () => {
  const fixture = await linkedinReaderFixture();
  const service = createLinkedinExperienceService(fixture);
  const input = linkedinExportInput();
  try {
    assert.equal((await service.start(input)).phase, 'opening');
    const row = await settled(service, input.requestId);
    assert.equal(row.phase, 'completed');
    assert.equal((await service.start(input)).revision, row.revision);
    assert.equal(fixture.calls.filter(([name]) => name === 'open').length, 1);
    const restored = await storedExperienceDocument(
      fixture.store,
      row.revision
    );
    assert.equal(restored.provenance.kind, 'linkedin-native');
    assert.ok(
      (await fixture.store.query()).every((entry) => privateSyncId(entry.id))
    );
    assert.equal(
      (await service.evidence({ ...input, name: 'linkedin-experience.txt' }))
        .text,
      linkedinExperienceRaw().text
    );
    await assert.rejects(
      service.evidence({ ...input, name: '../experience.lino' })
    );
    await writeFile(
      path.join(
        fixture.artifactRoot,
        input.requestId,
        'linkedin-experience.txt'
      ),
      'tampered'
    );
    await assert.rejects(
      service.evidence({ ...input, name: 'linkedin-experience.txt' })
    );
    const recovered = createLinkedinExperienceService({
      ...fixture,
      read: () => assert.fail('Recovery launched a browser'),
    });
    assert.equal((await recovered.start(input)).revision, row.revision);
    await recovered.close();
    await assert.rejects(service.start({ ...input, language: 'ru' }), {
      code: 'cv-linkedin-conflict',
    });
  } finally {
    await service.close();
    await fixture.close();
  }
});

test('Stop persists a tombstone, drains the active reader and refuses request replay after restart', async () => {
  const fixture = await linkedinReaderFixture();
  let entered;
  const opened = new Promise((resolve) => {
    entered = resolve;
  });
  let drained = false;
  const service = createLinkedinExperienceService({
    ...fixture,
    read: async ({ signal }, progress) => {
      await progress('waiting-login');
      entered();
      await new Promise((resolve) =>
        signal.addEventListener('abort', resolve, { once: true })
      );
      drained = true;
      signal.throwIfAborted();
    },
  });
  try {
    const input = linkedinExportInput();
    await service.start(input);
    await opened;
    await assert.rejects(
      service.start({ ...input, requestId: 'second-request' }),
      { code: 'cv-linkedin-busy' }
    );
    assert.equal((await service.stop(input)).phase, 'stopped');
    assert.equal(drained, true);
    assert.equal((await service.start(input)).phase, 'stopped');
    assert.equal(
      (await service.stop({ requestId: 'never-started' })).phase,
      'stopped'
    );
    assert.equal(
      (await service.start({ ...input, requestId: 'never-started' })).phase,
      'stopped'
    );
    await fixture.store.put(
      newLinkedinExport('lost-request', { ...input, requestId: 'lost-request' })
    );
    assert.equal(
      (await service.status({ requestId: 'lost-request' })).phase,
      'interrupted'
    );
    assert.equal(
      (await service.start({ ...input, requestId: 'lost-request' })).phase,
      'interrupted'
    );
  } finally {
    await service.close();
    await fixture.close();
  }
});

test('refused initial durable flush launches nothing and corrupt receipts cannot certify completion', async () => {
  const fixture = await linkedinReaderFixture();
  fixture.store.flush = async () => {
    throw new Error('disk refused');
  };
  const service = createLinkedinExperienceService(fixture);
  try {
    await assert.rejects(service.start(linkedinExportInput()), /disk refused/u);
    assert.equal(
      await fixture.store.get(
        linkedinExportKey(linkedinExportInput().requestId)
      ),
      null
    );
    assert.equal(fixture.calls.length, 0);
    const row = newLinkedinExport('bad-request', {
      ...linkedinExportInput(),
      requestId: 'other-request',
    });
    assert.throws(() => checkedLinkedinExport(row, 'bad-request'));
  } finally {
    await service.close();
    await fixture.close();
  }
});

test('refused snapshot flush removes new evidence and cannot certify a completed native export', async () => {
  const fixture = await linkedinReaderFixture();
  let refused = false;
  fixture.store.flush = async () => {
    if (
      !refused &&
      (await fixture.store.query()).some((row) =>
        row.id.startsWith('secret:cv-experience:')
      )
    ) {
      refused = true;
      throw new Error('Snapshot disk refused');
    }
  };
  const service = createLinkedinExperienceService(fixture);
  try {
    const input = linkedinExportInput();
    await service.start(input);
    assert.equal((await settled(service, input.requestId)).phase, 'failed');
    await service.close();
    assert.equal(refused, true);
    assert.deepEqual(await readdir(fixture.artifactRoot), []);
    assert.equal(
      (await fixture.store.query()).some((row) =>
        row.id.startsWith('secret:cv-experience:')
      ),
      false
    );
  } finally {
    await service.close();
    await fixture.close();
  }
});
