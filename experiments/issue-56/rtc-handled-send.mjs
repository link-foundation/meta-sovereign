// Three finite native sends: control, remote teardown, local teardown.
// Distinguish page JavaScript errors from WebKit's handled native diagnostic.
import assert from 'node:assert/strict';
import { webkit } from 'playwright';
const browser = await webkit.launch({ headless: true });
const diagnostics = [];
let phase = 'setup';
try {
  const context = await browser.newContext({ permissions: ['microphone'] });
  const page = await context.newPage();
  page.on('console', (event) => {
    if (event.text().startsWith('native-probe:')) {
      phase = event.text().slice(13);
    }
  });
  page.on('pageerror', (error) =>
    diagnostics.push({ phase, name: error.name, message: error.message })
  );
  await page.route('https://rtc-fixture.invalid/', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<title>Native RTC send</title>',
    })
  );
  await page.goto('https://rtc-fixture.invalid/');
  const result = await page.evaluate(async () => {
    const errors = [];
    globalThis.addEventListener('error', (event) => errors.push(event.message));
    globalThis.addEventListener('unhandledrejection', (event) =>
      errors.push(String(event.reason))
    );
    const media = await globalThis.navigator.mediaDevices.getUserMedia({
      audio: true,
    });
    const a = new globalThis.RTCPeerConnection({ iceServers: [] });
    const b = new globalThis.RTCPeerConnection({ iceServers: [] });
    let timer;
    let incoming;
    try {
      a.onicecandidate = (event) => {
        if (event.candidate) {
          void b.addIceCandidate(event.candidate).catch(() => {});
        }
      };
      b.onicecandidate = (event) => {
        if (event.candidate) {
          void a.addIceCandidate(event.candidate).catch(() => {});
        }
      };
      const channel = a.createDataChannel('bounded-native-fixture');
      const ready = new Promise((resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error('native fixture readiness')),
          10000
        );
        b.ondatachannel = (event) => {
          incoming = event.channel;
          incoming.onmessage = () => resolve();
        };
        channel.onopen = () => channel.send('control');
      });
      ready.catch(() => {});
      await a.setLocalDescription(await a.createOffer());
      await b.setRemoteDescription(a.localDescription);
      await b.setLocalDescription(await b.createAnswer());
      await a.setRemoteDescription(b.localDescription);
      await ready;
      const sends = [];
      const send = (phase) => {
        const entry = {
          phase,
          state: channel.readyState,
          connection: a.connectionState,
        };
        try {
          channel.send('after teardown');
          entry.sent = true;
        } catch (error) {
          entry.caught = { name: error.name, message: error.message };
        }
        sends.push(entry);
      };
      console.log('native-probe:immediate-teardown');
      b.close();
      send('remote-close');
      console.log('native-probe:local-close');
      a.close();
      send('local-close');
      await new Promise((resolve) =>
        globalThis.requestAnimationFrame(() =>
          globalThis.requestAnimationFrame(resolve)
        )
      );
      return { sends, errors };
    } finally {
      clearTimeout(timer);
      incoming?.close();
      a.close();
      b.close();
      media.getTracks().forEach((track) => track.stop());
    }
  });
  // Flush native protocol diagnostics without a timed sleep.
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        globalThis.requestAnimationFrame(() =>
          globalThis.requestAnimationFrame(resolve)
        )
      )
  );
  console.log(JSON.stringify({ result, diagnostics }, null, 2));
  assert.deepEqual(result.errors, []);
} finally {
  await browser.close();
}
