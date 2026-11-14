// Two isolated browser stores converge only through the real WebRTC channel.
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, openChatApp } from './helpers/e2e-chat.mjs';
import {
  watchChatPages,
  screenshotChatPages,
} from './helpers/e2e-page-errors.mjs';
import { traceSyncPeer } from './helpers/e2e-lino-sync-trace.mjs';
import { readSyncPeer } from './helpers/e2e-lino-sync-read.mjs';
import { checkReceiveIsolation } from './helpers/e2e-sync-receive-isolation.mjs';
import { checkSyncMesh } from './helpers/e2e-lino-sync-mesh.mjs';
import { checkCausalWrites } from './helpers/e2e-causal-writes.mjs';
import { checkSyncReconciliation } from './helpers/e2e-sync-reconciliation.mjs';

import { prepareSyncPeer, stopSyncPeer } from './helpers/e2e-sync-peer.mjs';

const store = createMemoryStore();
const { page, base, until, finish, errors, engine } = await openChatApp(
  'lino-sync',
  {
    store,
    serverOptions: { enableSync: true },
  }
);
await finish(async () => {
  const browser = page.context().browser();
  const context = await browser.newContext();
  watchChatPages(context, { errors, engine, base });
  const other = await context.newPage();
  // Exercise the production offline -> rediscovery reload deterministically.
  // Only this isolated peer's first exact-origin identity probe is interrupted.
  let interrupted = false;
  let documents = 0;
  other.on('framenavigated', (frame) => {
    if (frame === other.mainFrame()) {
      documents++;
    }
  });
  await other.route(`${base}/api/status?probe=1`, async (route) => {
    if (!interrupted) {
      interrupted = true;
      await route.abort('connectionreset');
    } else {
      await route.continue();
    }
  });
  const targets = [page, other];
  const traces = [];
  const peers = [];
  try {
    // Record actual wire frames and negotiated protocols without replacing sockets.
    for (const target of targets) {
      const trace = await traceSyncPeer(target, traces.length);
      traces.push(trace);
      peers.push(await prepareSyncPeer(target, base, engine));
      await trace('prepared');
    }
    const link = {
      id: 'l:rtc-lino-fixture',
      tokens: ['wire', '🚀'],
      body: '你好\r\nПривет "quoted"',
      single: [true],
      empty: [],
    };
    await page.evaluate(async (value) => {
      await globalThis.__msApi.put({
        id: 'secret:rtc-fixture',
        value: 'private fixture',
      });
      await globalThis.__msApi.put(value);
    }, link);
    let snapshot;
    await until(
      async () => {
        snapshot = await readSyncPeer(other, link.id);
        return Boolean(snapshot?.record?.body);
      },
      'WebRTC convergence',
      20000
    );
    const received = snapshot.record;
    const reloaded = peers[1].initialDocument !== peers[1].readyDocument;
    assert(interrupted && reloaded, 'real offline rediscovery reload');
    console.log(
      '[lino-sync-recovery]',
      JSON.stringify({ interrupted, reloaded, documents })
    );
    assert(
      received.body === link.body &&
        received.single[0] === true &&
        received.empty.length === 0,
      'exact typed Unicode record'
    );
    assert(!snapshot.secret, 'secrets excluded');
    assert(
      !(await store.get(link.id)),
      'convergence uses the data channel, not a server write'
    );
    for (const target of [page, other]) {
      const frames = await target.evaluate(() => globalThis.__syncWire);
      assert(
        frames.some(
          (frame) => frame.protocol === 'meta-sovereign-sync.lino.v2'
        ),
        'explicit Lino signaling protocol'
      );
      assert(
        frames.some((frame) => frame.text && frame.data.includes('sdp')),
        'actual Lino SDP received'
      );
      assert(
        frames
          .filter((frame) => frame.text)
          .every((frame) => !frame.data.trim().startsWith('{')),
        'signaling does not use JSON'
      );
    }
    await checkCausalWrites({ page, other, until, link });
    await page.evaluate((id) => globalThis.__msApi.del(id), link.id);
    await until(async () => {
      const current = await readSyncPeer(other, link.id);
      return Boolean(current && !current.record);
    }, 'WebRTC deletion');
    await checkSyncReconciliation({ page, other, base, until, store });
    await checkReceiveIsolation({ page, other, until });
    await checkSyncMesh({ page, other, base, engine, until, store });
  } catch (error) {
    // Inspect real connection state without logging SDP, addresses or records.
    for (const [index, target] of targets.entries()) {
      await traces[index]?.('failure');
      console.error(
        `[e2e-lino-sync] peer ${index}: ${JSON.stringify(
          await target.evaluate(() => ({
            rtc: globalThis.__syncRtc,
            wire: globalThis.__syncWire.map((frame) => ({
              protocol: frame.protocol,
              text: frame.text,
              sdp: typeof frame.data === 'string' && frame.data.includes('sdp'),
              candidate:
                typeof frame.data === 'string' &&
                frame.data.includes('candidate'),
            })),
          }))
        )}`
      );
    }
    if (process.env.E2E_ARTIFACT_DIR) {
      await screenshotChatPages(context, {
        artifactDir: process.env.E2E_ARTIFACT_DIR,
        name: 'lino-sync-peer',
        engine,
      });
    }
    throw error;
  } finally {
    for (const target of targets) {
      await stopSyncPeer(target);
    }
    await context.close();
  }
});
