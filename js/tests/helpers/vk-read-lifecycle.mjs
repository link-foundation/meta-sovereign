import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { LINO_TEXT } from '../../src/transport/lino.js';
import { createWirePost } from './http-wire.mjs';

/** Socket closure cannot release a store still owned by an admitted VK read. */
export const assertVkReadShutdown = async (
  fixture,
  resource,
  input,
  method,
  verify
) => {
  let release;
  let entered;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  fixture.hook(async (name) => {
    if (name === method) {
      entered();
      await held;
    }
  });
  const post = createWirePost(fixture.base, `/api/vk/${resource}`, LINO_TEXT);
  const request = post('/refresh', input).catch(() => null);
  let closing;
  try {
    await started;
    let closed = false;
    closing = fixture.close().then(() => {
      closed = true;
    });
    assert.equal(
      await Promise.race([
        closing.then(() => true),
        delay(100).then(() => false),
      ]),
      false
    );
    assert.equal(closed, false);
    release();
    await request;
    await closing;
    verify(await fixture.service.inspect(input));
    assert.equal(closed, true);
    assert.equal(fixture.stats().messages, 0);
  } finally {
    release();
    await request;
    await (closing ?? fixture.close());
  }
};
