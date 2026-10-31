import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodedMedia,
  MEDIA_LOAD_EVENT,
  mediaLoadTrace,
  watchMediaElement,
} from '../src/web/media-watch.js';
import { installClientLog } from '../src/web/client-log.js';
import { clientEntry } from '../src/server/routes-client-log.js';

const image = () =>
  Object.assign(new globalThis.EventTarget(), {
    tagName: 'IMG',
    complete: false,
    naturalWidth: 0,
    src: 'https://localhost:8787/api/telegram/media?chat=private&id=secret',
    currentSrc:
      'https://localhost:8787/api/telegram/media?chat=private&id=secret',
    removeAttribute(name) {
      if (name === 'src') {
        this.src = '';
      }
    },
  });

test('already decoded images settle without depending on another load event', () => {
  const node = image();
  node.complete = true;
  node.naturalWidth = 20;
  let ready = 0;
  const stop = watchMediaElement(node, {
    ready: () => ready++,
    stalled: () => assert.fail('not stalled'),
  });
  assert.equal(ready, 1);
  stop();
});

test('an image that never errors is released and retried after inactivity', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => t.mock.timers.reset());
  const node = image();
  let stalls = 0;
  const stop = watchMediaElement(
    node,
    { ready: () => assert.fail('not decoded'), stalled: () => stalls++ },
    { stallMs: 100, document: { visibilityState: 'visible' } }
  );
  t.mock.timers.tick(99);
  assert.equal(stalls, 0);
  t.mock.timers.tick(1);
  assert.equal(stalls, 1);
  assert.equal(node.src, '', 'release the stalled native request');
  stop();
  t.mock.timers.tick(1000);
  assert.equal(stalls, 1);
});

test('progress renews the deadline; cleanup prevents later state changes', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => t.mock.timers.reset());
  const node = image();
  let stalls = 0;
  const stop = watchMediaElement(
    node,
    { ready: () => {}, stalled: () => stalls++ },
    { stallMs: 100 }
  );
  t.mock.timers.tick(90);
  node.dispatchEvent(new globalThis.Event('progress'));
  t.mock.timers.tick(90);
  assert.equal(stalls, 0);
  stop();
  t.mock.timers.tick(1000);
  assert.equal(stalls, 0);
});

test('background tabs and native lazy images do not produce false stalls', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => t.mock.timers.reset());
  const node = image();
  const document = { visibilityState: 'hidden' };
  let stalls = 0;
  const stop = watchMediaElement(
    node,
    { ready: () => {}, stalled: () => stalls++ },
    { stallMs: 100, document }
  );
  t.mock.timers.tick(100);
  assert.equal(stalls, 0);
  document.visibilityState = 'visible';
  node.loading = 'lazy';
  node.currentSrc = '';
  t.mock.timers.tick(100);
  assert.equal(stalls, 0);
  stop();
  assert.equal(
    decodedMedia({ tagName: 'VIDEO', readyState: 2, paused: false }),
    false
  );
  assert.equal(
    decodedMedia({ tagName: 'VIDEO', readyState: 3, paused: false }),
    true
  );
});

test('stall diagnostics retain timings but never URLs or chat content', async () => {
  const target = new globalThis.EventTarget();
  const sent = [];
  const stop = installClientLog({
    target,
    send: (entry) => sent.push(clientEntry(entry)),
    view: () => 'chat',
  });
  mediaLoadTrace(image(), 'stalled', 15000, target);
  mediaLoadTrace(image(), 'recovered', 16000, target);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(
    sent.map((entry) => [entry.event, entry.durationMs, entry.code]),
    [
      ['client_media_stalled', 15000, 'media.img'],
      ['client_media_recovered', 16000, 'media.img'],
    ]
  );
  assert.equal(JSON.stringify(sent).includes('secret'), false);
  assert.equal(JSON.stringify(sent).includes('localhost'), false);
  stop();
  const event = new globalThis.Event(MEDIA_LOAD_EVENT);
  Object.defineProperty(event, 'detail', { value: { phase: 'stalled' } });
  target.dispatchEvent(event);
  await Promise.resolve();
  assert.equal(sent.length, 2, 'listener removed on teardown');
});
