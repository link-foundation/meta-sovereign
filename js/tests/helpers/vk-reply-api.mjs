import assert from 'node:assert/strict';
import { encodeWire, readWireResponse } from '../../src/transport/lino.js';

// Exercise the same real adapter/confirmation boundary for each reply kind.
export const vkReplyApi =
  (fixture, type) =>
  async (path, body, method = 'POST') => {
    const response = await fetch(`${fixture.base}/api/automations${path}`, {
      method,
      headers: { accept: type, 'content-type': type },
      body: encodeWire(body, type),
    });
    assert.ok(response.headers.get('content-type').startsWith(type));
    return { status: response.status, body: await readWireResponse(response) };
  };

export const confirmVkReplyOnce = async (
  fixture,
  call,
  draft,
  verifyContent
) => {
  assert.equal(fixture.vk.calls.length, 0);
  const request = { id: draft.id, text: draft.text, form: draft.form };
  const asked = await call('/drafts/send', request);
  assert.equal(asked.status, 428);
  assert.equal(fixture.vk.calls.length, 0);
  const confirmed = { ...request, confirmToken: asked.body.confirm.token };
  const done = await call('/drafts/send', confirmed);
  assert.equal(done.body.status, 'sent');
  assert.equal(fixture.receipts[0].via, 'api');
  assert.equal(fixture.receipts[0].result, 919);
  assert.equal(fixture.vk.calls.length, 1);
  const params = fixture.vk.calls[0].params;
  assert.equal(String(params.peer_id), '41');
  verifyContent(params);
  await call('/drafts/send', confirmed);
  assert.equal(fixture.vk.calls.length, 1);
};

export const confirmVkTextReply = async (fixture, type, automation, target) => {
  const call = vkReplyApi(fixture, type);
  const run = await call('/run', { automation, ...target });
  assert.equal(run.status, 200);
  const draft = run.body.queued[0];
  assert.ok(draft, automation);
  await confirmVkReplyOnce(fixture, call, draft, (params) =>
    assert.equal(params.message, draft.text)
  );
};
