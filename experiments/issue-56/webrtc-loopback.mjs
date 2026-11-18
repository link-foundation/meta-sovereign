// Bounded native RTC probe: no application, server, accounts or signaling codec.
// node experiments/issue-56/webrtc-loopback.mjs webkit [--permission] [--capture]
import { webkit, chromium } from 'playwright';

const engine = process.argv[2] ?? 'webkit';
const capture = process.argv.includes('--capture');
const permission = capture || process.argv.includes('--permission');
const browser = await { webkit, chromium }[engine].launch({
  headless: true,
  ...(process.env.E2E_EXECUTABLE_PATH
    ? { executablePath: process.env.E2E_EXECUTABLE_PATH }
    : {}),
});
try {
  const context = await browser.newContext({
    ...(permission ? { permissions: ['microphone'] } : {}),
  });
  const page = await context.newPage();
  // A secure fixture origin allows an explicit capture-policy comparison.
  await page.route('https://rtc-fixture.invalid/', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<title>RTC fixture</title>',
    })
  );
  await page.goto('https://rtc-fixture.invalid/');
  const result = await page.evaluate(async (capture) => {
    const trace = [];
    const a = new globalThis.RTCPeerConnection({ iceServers: [] });
    const b = new globalThis.RTCPeerConnection({ iceServers: [] });
    let media;
    let timer;
    let incoming;
    const channels = [];
    try {
      if (capture) {
        media = await globalThis.navigator.mediaDevices.getUserMedia({
          audio: true,
        });
      }
      for (const [label, pc, other] of [
        ['a', a, b],
        ['b', b, a],
      ]) {
        pc.onicecandidate = (event) => {
          trace.push({
            peer: label,
            event: 'ice',
            candidate: !!event.candidate,
          });
          if (event.candidate) {
            void other.addIceCandidate(event.candidate).catch((error) =>
              trace.push({
                peer: label,
                event: 'ice-error',
                name: error.name,
              })
            );
          }
        };
        pc.onconnectionstatechange = () =>
          trace.push({
            peer: label,
            event: 'connection',
            state: pc.connectionState,
          });
      }
      const received = new Promise((resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error('native RTC loopback timeout')),
          10_000
        );
        b.ondatachannel = (event) => {
          incoming = event.channel;
          channels.push(incoming);
          incoming.onmessage = (event) => resolve(event.data);
        };
      });
      received.catch(() => {});
      const channel = a.createDataChannel('fixture', {
        protocol: 'meta-sovereign-sync.lino.v2',
      });
      channels.push(channel);
      channel.onopen = () => channel.send('native fixture 🚀');
      const offer = await a.createOffer();
      await a.setLocalDescription(offer);
      await b.setRemoteDescription(offer);
      const answer = await b.createAnswer();
      await b.setLocalDescription(answer);
      await a.setRemoteDescription(answer);
      const value = await received;
      return { value, trace, states: [a.connectionState, b.connectionState] };
    } catch (error) {
      return {
        error: error.message,
        trace,
        states: [a.connectionState, b.connectionState],
      };
    } finally {
      clearTimeout(timer);
      channels.forEach((channel) => channel.close());
      a.close();
      b.close();
      media?.getTracks().forEach((track) => track.stop());
    }
  }, capture);
  console.log(
    JSON.stringify({ engine, permission, capture, ...result }, null, 2)
  );
  process.exitCode = result.value === 'native fixture 🚀' ? 0 : 1;
} finally {
  await browser.close();
}
