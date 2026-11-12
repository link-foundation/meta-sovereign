// Two isolated browser stores converge only through the real WebRTC channel.
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, openChatApp } from './helpers/e2e-chat.mjs';
import {
  watchChatPages,
  screenshotChatPages,
} from './helpers/e2e-page-errors.mjs';
import { traceSyncPeer } from './helpers/e2e-lino-sync-trace.mjs';

const preparePeer = async (target, base, engine) => {
  if (engine === 'webkit') {
    // Native WebKit filters host ICE candidates without active capture.
    // Playwright supplies mock devices; this fixture never opens a real mic.
    // Start capture before app boot so both peers have usable local ICE.
    // Production must use permitted ICE/network configuration, not ask for
    // microphone access merely to synchronize data.
    await target.context().grantPermissions(['microphone'], { origin: base });
    await target.route('**/app.min.js', async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: `globalThis.__syncFixtureMedia = await navigator.mediaDevices.getUserMedia({audio:true});\n${await response.text()}`,
      });
    });
  }
  await target.addInitScript(() => {
    globalThis.__syncWire = [];
    globalThis.__syncRtc = [];
    const NativeRtc = globalThis.RTCPeerConnection;
    globalThis.RTCPeerConnection = class extends NativeRtc {
      constructor(...args) {
        super(...args);
        const events = [];
        globalThis.__syncRtc.push(events);
        const record = (event, extra = {}) => {
          events.push({
            event,
            signaling: this.signalingState,
            connection: this.connectionState,
            ice: this.iceConnectionState,
            remote: !!this.remoteDescription,
            ...extra,
          });
        };
        for (const event of [
          'connectionstatechange',
          'iceconnectionstatechange',
          'signalingstatechange',
        ]) {
          this.addEventListener(event, () => record(event));
        }
        this.addEventListener('icecandidate', (event) =>
          record('icecandidate', { candidate: !!event.candidate })
        );
        this.addEventListener('datachannel', (event) => {
          record('datachannel', { protocol: event.channel.protocol });
          event.channel.addEventListener('open', () => record('channel-open'));
        });
        const add = this.addIceCandidate.bind(this);
        this.addIceCandidate = (candidate) => {
          record('add-ice', { present: !!candidate?.candidate });
          return add(candidate).catch((error) => {
            record('add-ice-error', { name: error.name });
            throw error;
          });
        };
      }
    };
    const Native = globalThis.WebSocket;
    globalThis.WebSocket = class extends Native {
      constructor(...args) {
        super(...args);
        this.addEventListener('open', () =>
          globalThis.__syncWire.push({ protocol: this.protocol })
        );
        this.addEventListener('message', (event) =>
          globalThis.__syncWire.push({
            text: typeof event.data === 'string',
            data: event.data,
          })
        );
      }
    };
  });
  await target.goto(`${base}/#settings`);
  await target.waitForFunction(() => !!globalThis.__msApi);
  await target.evaluate(() => globalThis.__msApi.status());
};

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
  const targets = [page, other];
  const traces = [];
  try {
    // Record actual wire frames and negotiated protocols without replacing sockets.
    for (const target of targets) {
      const trace = await traceSyncPeer(target, traces.length);
      traces.push(trace);
      await preparePeer(target, base, engine);
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
    await until(
      () =>
        other.evaluate(
          async (id) => (await globalThis.__msApi.get(id))?.body,
          link.id
        ),
      'WebRTC convergence',
      20000
    );
    const received = await other.evaluate(
      (id) => globalThis.__msApi.get(id),
      link.id
    );
    assert(
      received.body === link.body &&
        received.single[0] === true &&
        received.empty.length === 0,
      'exact typed Unicode record'
    );
    assert(
      !(await other.evaluate(() =>
        globalThis.__msApi.get('secret:rtc-fixture')
      )),
      'secrets excluded'
    );
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
    await page.evaluate((id) => globalThis.__msApi.del(id), link.id);
    await until(
      () =>
        other.evaluate(
          async (id) => !(await globalThis.__msApi.get(id)),
          link.id
        ),
      'WebRTC deletion'
    );
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
      if (!target.isClosed()) {
        // App update checks can fetch the intercepted bundle during teardown.
        // Finish those callbacks before disposing their request context.
        await target.unrouteAll({ behavior: 'wait' });
        await target.evaluate(() =>
          globalThis.__syncFixtureMedia
            ?.getTracks()
            .forEach((track) => track.stop())
        );
      }
    }
    await context.close();
  }
});
