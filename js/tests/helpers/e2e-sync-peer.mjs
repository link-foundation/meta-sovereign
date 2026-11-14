export const prepareSyncPeer = async (target, base, engine) => {
  // Changing only #chat to #settings reuses the current document; init scripts
  // would never instrument its already-open sockets. Replace that document
  // before installing fixture hooks, retaining the context's persistent data.
  await target.goto('about:blank');
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
        const close = this.close.bind(this);
        this.close = () => {
          close();
          record('disposed');
        };
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
          globalThis.__syncWire.push({
            protocol: this.protocol,
            rtc: new URL(this.url).pathname === '/rtc',
          })
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
  const initialDocument = await target.evaluate(async () => {
    await globalThis.__msApi.status();
    return globalThis.performance.timeOrigin;
  });
  // API presence also describes a fully offline document. Discovery can
  // replace it, so let Playwright follow that navigation and wait for the
  // real negotiated signaling connection before starting store operations.
  await target.waitForFunction(
    () =>
      Boolean(
        globalThis.__msApi &&
        globalThis.__syncWire?.some(
          (frame) =>
            frame.rtc && frame.protocol === 'meta-sovereign-sync.lino.v2'
        )
      ),
    null,
    { timeout: 20000 }
  );
  return {
    initialDocument,
    readyDocument: await target.evaluate(
      () => globalThis.performance.timeOrigin
    ),
  };
};

/** Finish fixture bundle requests and stop mock capture before disposing pages. */
export const stopSyncPeer = async (target) => {
  if (!target.isClosed()) {
    await target.unrouteAll({ behavior: 'wait' });
    await target.evaluate(() =>
      globalThis.__syncFixtureMedia
        ?.getTracks()
        .forEach((track) => track.stop())
    );
  }
};
