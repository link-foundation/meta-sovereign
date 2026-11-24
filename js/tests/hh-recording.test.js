import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  hhRecordingAnswer,
  hhRecordingChat,
  hhRecordingFixture,
} from '../../experiments/issue-56/hh-recording-fixture.mjs';
import { learnArchivedAnswers } from '../src/automation/question-archive.js';
import { importInto } from '../src/sources/index.js';
import { importDownloadedFile } from '../src/sources/auto-import/files.js';
import { startServer } from '../src/server/index.js';
import { withCausalWrites } from '../src/storage/causal-writes.js';
import {
  messageVersions,
  withMessageVersions,
} from '../src/storage/message-versions.js';
import { historicalMutation } from '../src/storage/mutation.js';
import { wrapSecretStore } from '../src/storage/secret-store.js';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  encodeWire,
  LINO_BINARY,
  LINO_TEXT,
  readWireResponse,
} from '../src/transport/lino.js';

test('the referenced HH history imports stable native rows and distinct archived edits', async () => {
  const store = withMessageVersions(createMemoryStore());
  const events = [];
  store.subscribe((event) => events.push(event));
  assert.equal(await importInto(store, 'hh', hhRecordingFixture()), 2);
  assert.equal(await importInto(store, 'hh', hhRecordingFixture()), 0);
  const { message, versions } = await messageVersions(store, hhRecordingAnswer);
  assert.equal(message.chat, `web:${hhRecordingChat}`);
  assert.equal(message.timestamp, null);
  assert.equal(message.delivery, 'unknown');
  assert.equal(message.via, 'archive');
  assert.equal(message.raw.hhRecording.recordedAt, '2026-11-21T11:00:00.000Z');
  assert.equal(message.versionPartial, true);
  assert.deepEqual(
    versions.map((record) => record.snapshot.body),
    ['Python and JavaScript', 'Python 3', 'Python']
  );
  assert.deepEqual(
    versions.map((record) => record.capturedAt),
    [null, null, null]
  );
  assert.ok(events.every((event) => event[historicalMutation]));
  assert.equal(events.length, 5);
  const learned = await learnArchivedAnswers(store, {});
  assert.deepEqual(learned.rules, []);
  assert.equal(learned.coverage.excludedChats, 1);
  assert.equal(learned.coverage.seen, 2);
});

test('a recording preserves a newer native observation and cannot revive a deleted row', async () => {
  const underlying = withMessageVersions(withCausalWrites(createMemoryStore()));
  const store = wrapSecretStore({
    inner: underlying,
    passphrase: 'test-only-store',
  });
  const question = `msg:hh:web:${hhRecordingChat}:86201`;
  await store.put({
    id: question,
    source: 'hh',
    chat: `web:${hhRecordingChat}`,
    body: 'Removed by owner',
  });
  await store.delete(question);
  await store.put({
    id: hhRecordingAnswer,
    source: 'hh',
    chat: `web:${hhRecordingChat}`,
    body: 'Confirmed current wording',
    timestamp: '2026-11-21T12:30:00Z',
    outgoing: true,
    delivery: 'sent',
  });
  const before = await store.get(hhRecordingAnswer);
  assert.equal(await importInto(store, 'hh', hhRecordingFixture()), 0);
  assert.equal(await store.get(question), null);
  assert.deepEqual(await store.get(hhRecordingAnswer), before);
  assert.deepEqual(
    await store.query((link) => link.kind === 'message-version'),
    []
  );
});

test('incomplete storage retry installs one history without creating extra revisions', async () => {
  const underlying = createMemoryStore();
  const write = underlying.putMany;
  underlying.putMany = async (links, options) => {
    if (links.some((link) => link.id === hhRecordingAnswer)) {
      throw new Error('fixture rejected the current row after saving versions');
    }
    return write(links, options);
  };
  const store = withMessageVersions(underlying);
  await assert.rejects(
    importInto(store, 'hh', hhRecordingFixture()),
    /fixture rejected/u
  );
  const before = await store.query((link) => link.kind === 'message-version');
  assert.equal(before.length, 3);
  assert.equal(await store.get(hhRecordingAnswer), null);
  underlying.putMany = write;
  assert.equal(await importInto(store, 'hh', hhRecordingFixture()), 2);
  assert.deepEqual(
    await store.query((link) => link.kind === 'message-version'),
    before
  );
});

test('a malformed recording cannot assign one native message to two chats', async () => {
  const store = createMemoryStore();
  const archive = hhRecordingFixture();
  archive['86101'] = archive[hhRecordingChat];
  await assert.rejects(importInto(store, 'hh', archive), /Invalid HeadHunter/u);
  assert.equal(store.size(), 0);
});

test('downloaded HH recordings report actual inserted rows on repeat import', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'meta-hh-recording-'));
  try {
    const filePath = path.join(dir, 'chat-history.json');
    const store = withMessageVersions(createMemoryStore());
    await writeFile(filePath, JSON.stringify(hhRecordingFixture()));
    const download = { store, provider: 'hh', filePath };
    const [first] = await importDownloadedFile(download);
    assert.equal(first.imported, 2);
    assert.equal(first.error, undefined);
    const [repeat] = await importDownloadedFile(download);
    assert.equal(repeat.imported, 0);
    assert.equal(repeat.error, undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test(
  'both Lino encodings retain recorder edits and disclose insufficient learning evidence',
  { timeout: 15000 },
  async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'meta-hh-upload-'));
    const store = createMemoryStore();
    let server;
    try {
      server = await startServer({
        store,
        storeDir: dir,
        enableSync: false,
        enableHandlers: false,
        telegramAccount: false,
        automations: { scheduler: false },
      });
      const base = `http://127.0.0.1:${server.port}`;
      for (const [type, inserted] of [
        [LINO_TEXT, 2],
        [LINO_BINARY, 0],
      ]) {
        const upload = await fetch(
          `${base}/api/archive/upload?source=hh&name=chat-history.json`,
          {
            method: 'POST',
            headers: {
              accept: type,
              'content-type': 'application/octet-stream',
            },
            body: JSON.stringify(hhRecordingFixture()),
          }
        );
        assert.equal(upload.status, 200);
        assert.equal((await readWireResponse(upload)).imported, inserted);
        const response = await fetch(
          `${base}/api/chat/versions?id=${encodeURIComponent(hhRecordingAnswer)}`,
          {
            headers: { accept: type },
          }
        );
        assert.equal(response.status, 200);
        const history = await readWireResponse(response);
        assert.equal(history.partial, true);
        assert.equal(history.count, 3);
        assert.equal(history.message.delivery, 'unknown');
        assert.equal(history.message.timestamp, null);
        const learned = await fetch(`${base}/api/automations/answers/learn`, {
          method: 'POST',
          headers: { accept: type, 'content-type': type },
          body: encodeWire({ apply: true }, type),
        });
        assert.equal(learned.status, 200);
        const report = await readWireResponse(learned);
        assert.deepEqual(report.rules, []);
        assert.equal(report.coverage.seen, 2);
        assert.equal(report.coverage.excludedChats, 1);
      }
      assert.equal(
        (await store.query((link) => link.id.startsWith('qa-rule:'))).length,
        0
      );
    } finally {
      await server?.close();
      await rm(dir, { recursive: true, force: true });
    }
  }
);
