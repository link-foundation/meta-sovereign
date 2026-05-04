# WebRTC TURN fallback (languages: [en](WEBRTC-TURN.md) • [zh](WEBRTC-TURN.zh.md) • hi • [ru](WEBRTC-TURN.ru.md))

`meta-sovereign` browsers के बीच WebRTC data channels से sync करता है।
Default SPA empty `iceServers` भेजता है, जो same Wi-Fi या LAN में direct
ICE pair बनने पर पर्याप्त है। Cross-NAT case में browser को public
reflexive address खोजने के लिए STUN और symmetric NAT में direct path न
मिलने पर bytes relay करने के लिए TURN चाहिए।

`meta-sovereign` hosted TURN नहीं देता। यह peer-to-peer system है; हर
byte third party से relay करना design के विरुद्ध है। SPA को अपने control
के TURN server पर point करें। [`coturn`][coturn] standard implementation
है और single container में चलता है।

## 1. coturn चलाएं

Minimal `docker-compose.yml` snippet:

```yaml
turn:
  image: coturn/coturn:latest
  network_mode: host
  command:
    - -n
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

Firewall पर `3478/udp`, `3478/tcp`, `5349/tcp` और relay range
`49160-49200/udp` खोलें। `CHANGE_ME` को real shared secret से बदलें।
Public deployment के लिए `--cert` / `--pkey` जोड़ें ताकि HTTPS page
`turns:` URLs उपयोग कर सके।

## 2. SPA को बताएं

`createWebRtcTransport` का `rtcConfig` सीधे
`new RTCPeerConnection(rtcConfig)` को जाता है:

```js
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
    iceTransportPolicy: 'all',
  },
});
```

TURN path अलग से verify करना हो तो `iceTransportPolicy: 'relay'` set
करें।

## 3. Long-term secret peers को न भेजें

Long-term TURN credentials SPA bundle से extract हो सकते हैं। दो बेहतर
तरीके:

1. Credentials को अपने users/auth से bind करें और logged-in endpoint से
   short-lived values दें। उन्हें `secret:turn` link में store करें।
2. coturn REST-style ephemeral credentials उपयोग करें:
   `--use-auth-secret --static-auth-secret=<long random string>` और server
   पर [RFC 7635 / draft-uberti-behave-turn-rest] के अनुसार short-lived
   username/HMAC credential mint करें।

## 4. Verify करें

Chromium में `chrome://webrtc-internals` या Firefox में `about:webrtc`
actual ICE candidate pair दिखाता है। `iceTransportPolicy: 'relay'`
force करें, अलग networks में दो SPAs खोलें, और local candidate का
`type: relay` confirm करें।

[coturn]: https://github.com/coturn/coturn
[RFC 7635 / draft-uberti-behave-turn-rest]: https://datatracker.ietf.org/doc/html/draft-uberti-behave-turn-rest-00
