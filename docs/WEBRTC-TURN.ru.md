# WebRTC TURN fallback (languages: [en](WEBRTC-TURN.md) • [zh](WEBRTC-TURN.zh.md) • [hi](WEBRTC-TURN.hi.md) • ru)

`meta-sovereign` синхронизирует browsers через WebRTC data channels. По
умолчанию SPA передает пустой `iceServers`; этого достаточно в одной
Wi-Fi или LAN, где peers могут напрямую собрать ICE pair. В cross-NAT
сценарии browser нужен STUN для обнаружения public reflexive address, а
при symmetric NAT нужен TURN relay, если direct path открыть нельзя.

`meta-sovereign` не поставляет hosted TURN. Это peer-to-peer system, и
relay каждого byte через third party противоречит дизайну. Направьте SPA
на TURN server под вашим контролем. [`coturn`][coturn] - стандартная
реализация, которая запускается в одном container.

## 1. Запустите coturn

Минимальный `docker-compose.yml` snippet:

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

Откройте в firewall `3478/udp`, `3478/tcp`, `5349/tcp` и relay range
`49160-49200/udp`. Замените `CHANGE_ME` на настоящий shared secret. Для
public deployment добавьте `--cert` / `--pkey`, чтобы HTTPS page мог
использовать `turns:` URLs.

## 2. Настройте SPA

`createWebRtcTransport` принимает `rtcConfig` и передает его напрямую в
`new RTCPeerConnection(rtcConfig)`:

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

`iceTransportPolicy: 'relay'` полезен, когда нужно отдельно проверить
TURN path: peers будут принимать только relay candidates.

## 3. Не отдавайте long-term secret peers

Long-term TURN credentials можно извлечь из SPA bundle. Два варианта
лучше:

1. Привязать credentials к вашим users/auth и отдавать short-lived values
   через server endpoint. Храните их как `secret:turn` link.
2. Использовать coturn REST-style ephemeral credentials:
   `--use-auth-secret --static-auth-secret=<long random string>` и mint
   short-lived username/HMAC credential server-side по
   [RFC 7635 / draft-uberti-behave-turn-rest].

## 4. Проверка

`chrome://webrtc-internals` в Chromium или `about:webrtc` в Firefox
показывает выбранный ICE candidate pair. Принудительно включите
`iceTransportPolicy: 'relay'`, откройте два SPA из сетей без direct
reachability и убедитесь, что local candidate имеет `type: relay`.

[coturn]: https://github.com/coturn/coturn
[RFC 7635 / draft-uberti-behave-turn-rest]: https://datatracker.ietf.org/doc/html/draft-uberti-behave-turn-rest-00
