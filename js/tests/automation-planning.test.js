import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { createAutomationRunner } from '../src/automation/runner.js';
import { draftId } from '../src/automation/automations.js';
import { draftActionNotice, runNotice } from '../src/web/chat-state.js';

const message = (chat, sender, id) => ({
  id: `msg:telegram:${chat}:${id}`,
  source: 'telegram',
  chat,
  chatType: 'personal_chat',
  chatName: `Fixture ${chat}`,
  sender,
  body: 'Здравствуйте! Вы свободны?',
  timestamp: '2026-01-01T00:00:00Z',
});

test('targeted planning never copies cold payloads or reads unrelated chat text and preserves owner inference', async () => {
  const store = createMemoryStore({
    retain: (link) => {
      const saved = { ...link };
      if (link.id.startsWith('msg:')) {
        for (const field of ['raw', 'tokens', 'children']) {
          Object.defineProperty(saved, field, {
            enumerable: true,
            get() {
              throw new Error('provider payload was read');
            },
          });
        }
        if (link.chat === '222') {
          Object.defineProperty(saved, 'body', {
            enumerable: true,
            get() {
              throw new Error('unrelated chat text was read');
            },
          });
        }
      }
      return saved;
    },
    copy: (link) => {
      assert(
        !link.id.startsWith('msg:'),
        'planner must use summary projection'
      );
      return { ...link };
    },
  });
  for (const chat of ['111', '222']) {
    await store.put(message(chat, '42', 1));
    await store.put(message(chat, chat, 2));
  }
  const runner = createAutomationRunner({ store });
  const plan = await runner.plan(await runner.load('job-search'), {
    test: true,
    targets: [{ source: 'telegram', chat: '111' }],
  });
  assert.equal(plan.drafts.length, 1);
  assert.equal(plan.drafts[0].chat, '111');
  assert.equal(plan.drafts[0].mine, 1);
  assert(plan.selfIds.includes('42'));
});

test('re-testing returns the same pending edited draft without rewriting it or sending', async () => {
  const store = createMemoryStore();
  await store.put(message('111', 'me', 1));
  await store.put(message('111', '111', 2));
  const sent = [];
  const runner = createAutomationRunner({
    store,
    send: async (draft) => sent.push(draft),
  });
  const options = {
    test: true,
    targets: [{ source: 'telegram', chat: '111' }],
  };
  const first = await runner.run('job-search', options);
  const id = first.queued[0].id;
  const saved = await store.get(id);
  await store.put({ ...saved, text: 'My preserved edit' });
  let writes = 0;
  const stop = store.subscribe((event) => {
    if (event.link?.id === id) {
      writes++;
    }
  });
  store.scan = () =>
    assert.fail('reopening an existing preview must not scan history');
  const second = await runner.run('job-search', options);
  stop();
  assert.equal(second.queued.length, 1);
  assert.equal(second.queued[0].id, id);
  assert.equal(second.queued[0].text, 'My preserved edit');
  assert.equal(writes, 0);
  assert.equal(sent.length, 0);
  assert.equal((await runner.drafts()).length, 1);
  assert.equal(
    id,
    draftId(await runner.load('job-search'), options.targets[0])
  );
});

test('a server refusal or malformed automation response never looks like a successful zero-message send', () => {
  assert.equal(
    runNotice({ error: 'fixture failure', httpStatus: 500 }).kind,
    'failed'
  );
  assert.equal(runNotice({ ok: false }).kind, 'failed');
  assert.equal(runNotice({ results: [], httpStatus: 500 }).kind, 'failed');
  assert.equal(runNotice({}).kind, 'failed');
  assert.equal(runNotice(null).kind, 'failed');
  assert.equal(runNotice({ queued: [] }).kind, 'nothing');
});

test('draft actions require confirmed outcomes and keep uncertain sends distinct', () => {
  for (const action of ['send', 'form', 'mark', 'skip']) {
    for (const result of [
      null,
      {},
      { error: 'fixture refusal', httpStatus: 503 },
    ]) {
      assert.equal(draftActionNotice(action, result).kind, 'failed');
    }
  }
  assert.equal(
    draftActionNotice('send', { status: 'unknown' }).code,
    'unknown-send'
  );
  assert.equal(
    draftActionNotice('send', { status: 'sent' }).kind,
    'draft-send'
  );
  assert.equal(
    draftActionNotice('skip', { status: 'skipped' }).kind,
    'draft-skip'
  );
  assert.equal(draftActionNotice('form', { id: 'fixture-draft' }), null);
});
