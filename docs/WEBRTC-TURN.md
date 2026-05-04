# WebRTC TURN fallback (languages: en • [zh](WEBRTC-TURN.zh.md) • [hi](WEBRTC-TURN.hi.md) • [ru](WEBRTC-TURN.ru.md))

`meta-sovereign` syncs browser-to-browser over WebRTC data channels.
By default the SPA passes an empty `iceServers` array, which is fine
on the same Wi-Fi or any LAN where peers can ICE-pair directly. For
the cross-NAT case — peer A on a home network, peer B on a coffee
shop — the browser needs a STUN server to discover its public
reflexive address, and (when both NATs are symmetric) a TURN relay
to forward bytes when a direct path can't be opened.

`meta-sovereign` does **not** ship a hosted TURN. We are a
peer-to-peer system; relaying every byte through a third party
contradicts the design. Instead, point the SPA at a TURN server you
control. [`coturn`][coturn] is the standard implementation and runs
in a single container.

## 1. Run coturn

A minimal `docker-compose.yml` snippet that sits alongside the
existing `docker/docker-compose.yml`:

```yaml
turn:
  image: coturn/coturn:latest
  network_mode: host # TURN needs the host's IP, not Docker's bridge
  command:
    - -n # do not load /etc/coturn/turnserver.conf
    - --listening-port=3478
    - --tls-listening-port=5349
    - --realm=meta-sovereign.example
    - --fingerprint
    - --lt-cred-mech
    - --user=meta-sovereign:CHANGE_ME
    - --no-cli
    - --no-loopback-peers
    - --no-multicast-peers
    - --min-port=49160
    - --max-port=49200
```

Open ports `3478/udp`, `3478/tcp`, `5349/tcp` (TLS), and the
ephemeral relay range (`49160-49200/udp` above) on your firewall.
Pick a real shared secret — `CHANGE_ME` is for the README.

For a public deployment add `--cert` / `--pkey` (Let's Encrypt is
fine) so the TLS listener serves real certificates and clients can
use `turns:` URLs from a `https://` page.

## 2. Tell the SPA about it

`createWebRtcTransport` (`src/sync/webrtc-transport.js`) accepts an
`rtcConfig` argument that is forwarded straight to
`new RTCPeerConnection(rtcConfig)`. To use your TURN server, pass
its URL and credentials:

```js
import {
  signalingChannel,
  createWebRtcTransport,
} from '../sync/webrtc-transport.js';
import { connectSyncWebSocket } from '../sync/ws-transport.js';

const ws = connectSyncWebSocket(`${location.origin}/rtc`);
const signaling = signalingChannel(ws);

const transport = createWebRtcTransport({
  signaling,
  RTCPeerConnection: window.RTCPeerConnection,
  initiator: true,
  rtcConfig: {
    iceServers: [
      { urls: 'stun:turn.example.com:3478' },
      {
        urls: 'turn:turn.example.com:3478?transport=udp',
        username: 'meta-sovereign',
        credential: 'CHANGE_ME',
      },
      {
        urls: 'turns:turn.example.com:5349?transport=tcp',
        username: 'meta-sovereign',
        credential: 'CHANGE_ME',
      },
    ],
    iceTransportPolicy: 'all', // 'relay' to force every byte through TURN
  },
});
```

Setting `iceTransportPolicy: 'relay'` is useful when you want to
verify the TURN path in isolation — peers will refuse to use any
candidate that isn't a TURN relay candidate.

## 3. Don't ship the secret to peers

Long-term shared TURN credentials are a problem: anyone with the
SPA bundle can extract them and hammer your relay. Two ways to
avoid that:

1. **Bind to your own users.** Put the TURN server behind the same
   auth as your `meta-sovereign` deployment and serve the
   credentials from a server endpoint the user is already logged
   into. Store them in the universal links store under a
   `secret:turn` id so `wrapSecretStore` encrypts them at rest and
   `createPeer` refuses to ship them to other peers (this is
   exactly the pattern used for `secret:telegram` etc. — see
   `src/storage/secret-store.js`).
2. **Use coturn's REST-style ephemeral credentials.** Run coturn
   with `--use-auth-secret --static-auth-secret=<long random string>`,
   then mint short-lived `username` / `credential` pairs server-side
   per [RFC 7635 / draft-uberti-behave-turn-rest].
   The shared secret never leaves your server; clients only ever
   see a username that looks like `<expiry>:<userid>` and a HMAC
   credential that's valid for a few minutes.

## 4. Verify it works

`chrome://webrtc-internals` (Chromium) or `about:webrtc` (Firefox)
shows the ICE candidate pair the data channel actually settled on.
Force `iceTransportPolicy: 'relay'`, open two SPAs from networks
that can't reach each other directly, and confirm the chosen pair's
local candidate has `type: relay`.

[coturn]: https://github.com/coturn/coturn
[draft-uberti-behave-turn-rest]: https://datatracker.ietf.org/doc/html/draft-uberti-behave-turn-rest-00
