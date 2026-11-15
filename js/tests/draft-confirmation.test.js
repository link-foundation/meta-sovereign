import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { replyFingerprint } from '../src/automation/personal-reply.js';
import { stillConfirmed } from '../src/automation/runner.js';
import { gratitudeServer } from '../../experiments/issue-56/vk-gratitude-fixture.mjs';
import { seedIdentity } from '../../experiments/issue-56/vk-identity-fixture.mjs';
import { vkReplyApi } from './helpers/vk-reply-api.mjs';

const target = { targets: [{ source: 'vk', chat: '41' }] };
const changedDraft = async (fixture, draft, kind) => {
  const stored = await fixture.store.get(draft.id);
  if (kind === 'text') {
    return { ...stored, text: 'A different message after review' };
  }
  if (kind === 'sticker') {
    const id = String(Number(stored.sticker.id) + 1);
    return {
      ...stored,
      sticker: { ...stored.sticker, id },
      gratitude: { ...stored.gratitude, sticker: id },
    };
  }
  const message = await fixture.store.get(stored.identity.message);
  const changed = { ...message, body: 'Кто вы?' };
  await fixture.store.put(changed);
  if (kind === 'shared context') {
    stored.identity.fingerprint = replyFingerprint(changed);
    return stored;
  }
  return {
    ...stored,
    identity: {
      ...stored.identity,
      fingerprint: replyFingerprint(changed),
    },
  };
};

for (const type of [LINO_TEXT, LINO_BINARY]) {
  for (const kind of ['text', 'sticker', 'context', 'shared context']) {
    test(
      `draft confirmation freezes stored ${kind} through ${type}`,
      { timeout: 20000 },
      async () => {
        const fixture = await gratitudeServer(
          kind === 'sticker' ? {} : { seed: seedIdentity }
        );
        try {
          const call = vkReplyApi(fixture, type);
          const run = await call('/run', {
            automation: kind === 'sticker' ? 'gratitude' : 'identity',
            ...target,
          });
          const draft = run.body.queued[0];
          assert.ok(draft);
          const request = { id: draft.id };
          const asked = await call('/drafts/send', request);
          assert.equal(asked.status, 428);
          await fixture.store.put(await changedDraft(fixture, draft, kind));
          const done = await call('/drafts/send', {
            ...request,
            confirmToken: asked.body.confirm.token,
          });
          console.info(
            JSON.stringify({
              kind,
              type,
              status: done.body.status,
              code: done.body.code,
              providerCalls: fixture.vk.calls.length,
            })
          );
          assert.equal(done.body.code, 'draft-changed');
          assert.equal(done.status, 409);
          assert.equal(fixture.vk.calls.length, 0);
          assert.equal(fixture.receipts.length, 0);
          assert.ok(await fixture.store.get(draft.id));
          assert.deepEqual(
            await fixture.store.query((l) => l.id.startsWith('outbox:')),
            []
          );
        } finally {
          await fixture.close();
        }
      }
    );
  }
}

test(
  'a draft preview contains the rendered content and permits unchanged owner edits',
  { timeout: 20000 },
  async () => {
    const fixture = await gratitudeServer({ seed: seedIdentity });
    try {
      const call = vkReplyApi(fixture, LINO_TEXT);
      const run = await call('/run', { automation: 'identity', ...target });
      const draft = run.body.queued[0];
      const asked = await call('/drafts/send', { id: draft.id });
      assert.equal(asked.body.preview.text, draft.text);
      assert.equal(asked.body.preview.form, draft.form);
      assert.deepEqual(asked.body.preview.identity, draft.identity);
      const request = {
        id: draft.id,
        form: 'formal',
        text: 'Reviewed owner text',
      };
      const edited = await call('/drafts/send', request);
      assert.equal(edited.body.preview.text, request.text);
      assert.equal(edited.body.preview.form, request.form);
      const result = await call('/drafts/send', {
        ...request,
        confirmToken: edited.body.confirm.token,
      });
      assert.equal(result.body.status, 'sent');
      assert.equal(fixture.vk.calls.length, 1);
      assert.equal(fixture.vk.calls[0].params.message, request.text);
    } finally {
      await fixture.close();
    }
  }
);

test('automatic confirmation binds draft identity, address form and full answer evidence', () => {
  const draft = {
    id: 'draft:one',
    automation: 'automation:one',
    source: 'vk',
    chat: '41',
    form: 'informal',
    text: 'Reviewed',
    answer: { message: 'msg:one', fingerprint: 'old' },
  };
  assert.equal(
    stillConfirmed([draft], [globalThis.structuredClone(draft)]).length,
    1
  );
  for (const change of [
    { id: 'draft:two' },
    { automation: 'automation:two' },
    { form: 'formal' },
    { answer: { ...draft.answer, fingerprint: 'new' } },
  ]) {
    assert.equal(stillConfirmed([{ ...draft, ...change }], [draft]).length, 0);
  }
});
