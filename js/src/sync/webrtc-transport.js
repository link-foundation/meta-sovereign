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

// The broker broadcasts frames to the room, including late answers from other
// tabs. Event dispatch must consume rejected negotiation promises as well.
const onSignal = (signaling, type, handler, onError) =>
  signaling.on(type, (msg) =>
    Promise.resolve()
      .then(() => handler(msg))
      .catch(onError)
  );

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
  onError = (error) =>
    globalThis.console?.warn?.('WebRTC negotiation failed', error),
}) => {
  const pc = new RTCPeerConnection(rtcConfig);
  const recvHandlers = new Set();
  const sendQueue = [];
  let dataChannel = null;
  let awaitingAnswer = false;
  let closed = false;

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

  const offOffer = onSignal(
    signaling,
    TYPE_OFFER,
    async (msg) => {
      if (closed || awaitingAnswer || dataChannel?.readyState === 'open') {
        return;
      }
      await pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      signaling.sendAnswer(answer.sdp);
    },
    onError
  );

  const offAnswer = onSignal(
    signaling,
    TYPE_ANSWER,
    async (msg) => {
      if (closed || !awaitingAnswer) {
        return;
      }
      // Claim this answer before awaiting: a duplicate cannot race it.
      awaitingAnswer = false;
      await pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
    },
    onError
  );

  const offIce = signaling.on(TYPE_ICE, async (msg) => {
    if (msg.candidate) {
      try {
        await pc.addIceCandidate(msg.candidate);
      } catch {
        // ignore — late candidates are OK to drop
      }
    }
  });

  const startAsInitiator = async () => {
    if (closed || awaitingAnswer || dataChannel?.readyState === 'open') {
      return;
    }
    awaitingAnswer = true;
    if (!dataChannel) {
      // Late initiation: open the data channel now if we deferred it.
      wireChannel(pc.createDataChannel(channelLabel));
    }
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      signaling.sendOffer(offer.sdp);
    } catch (error) {
      awaitingAnswer = false;
      throw error;
    }
  };

  if (initiator) {
    startAsInitiator().catch(onError);
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
      closed = true;
      offOffer();
      offAnswer();
      offIce();
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
