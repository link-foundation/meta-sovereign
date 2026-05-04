# WebRTC TURN 回退 (languages: [en](WEBRTC-TURN.md) • zh • [hi](WEBRTC-TURN.hi.md) • [ru](WEBRTC-TURN.ru.md))

`meta-sovereign` 通过 WebRTC data channels 在浏览器之间同步。默认 SPA
传入空的 `iceServers`，这适合同一 Wi-Fi 或 LAN 中能直接建立 ICE pair 的
设备。跨 NAT 场景下，浏览器需要 STUN 来发现公网 reflexive address；如果
双方 NAT 都是 symmetric，还需要 TURN relay 转发无法直连的数据。

`meta-sovereign` **不提供托管 TURN**。本项目是 peer-to-peer 系统，把所有
字节都转发到第三方会违背设计目标。请把 SPA 指向你控制的 TURN 服务器。
[`coturn`][coturn] 是标准实现，可以用单个容器运行。

## 1. 运行 coturn

最小 `docker-compose.yml` 片段：

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

在防火墙上打开 `3478/udp`、`3478/tcp`、`5349/tcp` 和 relay 范围
`49160-49200/udp`。把 `CHANGE_ME` 换成真正的 shared secret。公开部署还
应配置 `--cert` / `--pkey`，让 HTTPS 页面可以使用 `turns:` URL。

## 2. 告诉 SPA

`createWebRtcTransport` 接受 `rtcConfig` 并原样传给
`new RTCPeerConnection(rtcConfig)`：

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

把 `iceTransportPolicy` 设为 `'relay'` 可以强制所有字节走 TURN，用于单独
验证 relay 路径。

## 3. 不要把长期 secret 发给 peer

长期 TURN 凭据会出现在 SPA bundle 中，任何人都能提取并消耗 relay。推荐两
种方式：

1. 绑定到你自己的用户登录态，从服务端端点返回短期凭据，并用 `secret:turn`
   存在 universal links store 中。
2. 使用 coturn 的 REST-style ephemeral credentials：
   `--use-auth-secret --static-auth-secret=<long random string>`，服务端按
   [RFC 7635 / draft-uberti-behave-turn-rest] 生成短期用户名和 HMAC 密码。

## 4. 验证

Chromium 的 `chrome://webrtc-internals` 或 Firefox 的 `about:webrtc` 会显示
实际选中的 ICE candidate pair。将 `iceTransportPolicy` 设为 `'relay'`，在
无法直连的两个网络中打开两个 SPA，并确认 local candidate 的 `type` 是
`relay`。

[coturn]: https://github.com/coturn/coturn
[RFC 7635 / draft-uberti-behave-turn-rest]: https://datatracker.ietf.org/doc/html/draft-uberti-behave-turn-rest-00
