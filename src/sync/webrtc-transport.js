/**
 * WebRTC sync transport.
 *
 * Two browsers (or one browser + an Electron main, etc.) want to
 * exchange links without going through the central server. They
 * connect to the /rtc signaling broker (a WebSocket relay), trade
 * SDP offers/answers + ICE candidates, then open an RTCDataChannel
 * and switch to it. Once the data channel is open the broker is no
 * longer involved — peers talk directly.
 *
 * The transport exposes the standard `{ send, onMessage }` contract
 * so `createPeer().connect(transport)` plugs straight in, mirroring
 * the loopback / TCP / WebSocket transports.
 *
 * The `signalingChannel` helper isolates the JSON-over-WS plumbing
 * from RTCPeerConnection so we can test the signaling logic in
 * Node without `wrtc`. The browser code wires the two together by
 * calling `createWebRtcTransport({ signaling, RTCPeerConnection })`.
 */

const TYPE_OFFER = 'offer';
const TYPE_ANSWER = 'answer';
const TYPE_ICE = 'ice';
const TYPE_PEER_JOINED = 'peer-joined';

/**
 * Wrap a `{ send, onMessage }` transport (typically a WebSocket to
 * /rtc) in a typed signaling channel. Returns helpers used by
 * `createWebRtcTransport` and exposed for tests.
 */
export const signalingChannel = (transport) => {
  const handlers = new Map();
  transport.onMessage((msg) => {
    const set = handlers.get(msg?.type);
    if (set) {
      for (const h of set) {
        h(msg);
      }
    }
    const all = handlers.get('*');
    if (all) {
      for (const h of all) {
        h(msg);
      }
    }
  });
  return {
    on: (type, handler) => {
      if (!handlers.has(type)) {
        handlers.set(type, new Set());
      }
      handlers.get(type).add(handler);
      return () => handlers.get(type)?.delete(handler);
    },
    sendOffer: (sdp) => transport.send({ type: TYPE_OFFER, sdp }),
    sendAnswer: (sdp) => transport.send({ type: TYPE_ANSWER, sdp }),
    sendIce: (candidate) => transport.send({ type: TYPE_ICE, candidate }),
    raw: transport,
  };
};

/**
 * Create a WebRTC data-channel transport. The peer that wants to
 * initiate creates an offer immediately; the peer that *receives*
 * `peer-joined` waits for the offer. Both sides expose the same
 * `{ send, onMessage }` contract.
 *
 * `RTCPeerConnection` is taken as a parameter so tests can pass a
 * fake class without depending on `wrtc`.
 */
export const createWebRtcTransport = ({
  signaling,
  RTCPeerConnection,
  initiator = false,
  rtcConfig = { iceServers: [] },
  channelLabel = 'meta-sovereign-sync',
}) => {
  const pc = new RTCPeerConnection(rtcConfig);
  const recvHandlers = new Set();
  const sendQueue = [];
  let dataChannel = null;

  const wireChannel = (channel) => {
    dataChannel = channel;
    channel.onopen = () => {
      while (sendQueue.length) {
        channel.send(sendQueue.shift());
      }
    };
    channel.onmessage = (event) => {
      let parsed;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        return;
      }
      for (const h of recvHandlers) {
        h(parsed);
      }
    };
  };

  if (initiator) {
    wireChannel(pc.createDataChannel(channelLabel));
  } else {
    pc.ondatachannel = (event) => wireChannel(event.channel);
  }

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      signaling.sendIce(event.candidate);
    }
  };

  signaling.on(TYPE_OFFER, async (msg) => {
    await pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    signaling.sendAnswer(answer.sdp);
  });

  signaling.on(TYPE_ANSWER, async (msg) => {
    await pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
  });

  signaling.on(TYPE_ICE, async (msg) => {
    if (msg.candidate) {
      try {
        await pc.addIceCandidate(msg.candidate);
      } catch {
        // ignore — late candidates are OK to drop
      }
    }
  });

  const startAsInitiator = async () => {
    if (!dataChannel) {
      // Late initiation: open the data channel now if we deferred it.
      wireChannel(pc.createDataChannel(channelLabel));
    }
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    signaling.sendOffer(offer.sdp);
  };

  if (initiator) {
    startAsInitiator().catch(() => {});
  } else {
    signaling.on(TYPE_PEER_JOINED, async () => {
      // When a new peer joins, *they* become initiator; this side
      // does nothing extra. Hook left in case callers want to know.
    });
  }

  return {
    send: (event) => {
      const text = JSON.stringify(event);
      if (dataChannel?.readyState === 'open') {
        dataChannel.send(text);
      } else {
        sendQueue.push(text);
      }
    },
    onMessage: (h) => {
      recvHandlers.add(h);
      return () => recvHandlers.delete(h);
    },
    close: () => {
      try {
        dataChannel?.close();
      } catch {
        // ignore
      }
      try {
        pc.close();
      } catch {
        // ignore
      }
    },
    startAsInitiator,
    pc,
  };
};
