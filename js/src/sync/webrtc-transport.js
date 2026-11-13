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
 * The `signalingChannel` helper isolates the typed signaling plumbing
 * from RTCPeerConnection so we can test the signaling logic in
 * Node without `wrtc`. The browser code wires the two together by
 * calling `createWebRtcTransport({ signaling, RTCPeerConnection })`.
 */

import { syncWire, syncQueue } from './wire.js';

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

// ICE can precede its offer on the signaling socket. Keep a finite queue
// until setRemoteDescription completes, and dispose it with this connection.
const manageIceCandidates = (pc, signaling, onError) => {
  let closed = false;
  const pendingIce = [];
  const addIce = async (candidate) => {
    try {
      await pc.addIceCandidate(candidate);
    } catch {
      // A late candidate may refer to a superseded ICE generation.
    }
  };
  const flushIce = async () => {
    while (!closed && pendingIce.length) {
      await addIce(pendingIce.shift());
    }
  };

  const offIce = signaling.on(TYPE_ICE, (msg) => {
    if (closed || !msg.candidate) {
      return;
    }
    if (pc.remoteDescription) {
      void addIce(msg.candidate);
    } else if (pendingIce.length < 128) {
      pendingIce.push(msg.candidate);
    } else {
      onError(new Error('too many pending WebRTC ICE candidates'));
    }
  });

  return {
    flush: flushIce,
    close() {
      closed = true;
      pendingIce.length = 0;
      offIce();
    },
  };
};

const closeRtc = (resource) => {
  try {
    resource?.close();
  } catch {
    // Already disposed by the browser.
  }
};

// Channel-open callbacks run outside peer.send's failure isolation. A native
// send may fail during the open event; disposal must precede error reporting.
const drainChannel = (channel, queue, wire, close, onError) => {
  try {
    queue.drain((event) => channel.send(wire.encode(event)));
  } catch (error) {
    close();
    onError(error);
  }
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
  format,
  jsonCompatibility = false,
  onError = (error) =>
    globalThis.console?.warn?.('WebRTC negotiation failed', error),
}) => {
  const wire = syncWire({ format, jsonCompatibility });
  const pc = new RTCPeerConnection(rtcConfig);
  const recvHandlers = new Set();
  const sendQueue = syncQueue();
  let dataChannel = null;
  let awaitingAnswer = false;
  let closed = false;
  const ice = manageIceCandidates(pc, signaling, onError);

  const wireChannel = (channel) => {
    if (closed) {
      channel.close();
      return;
    }
    if (channel.protocol !== wire.protocol) {
      channel.close();
      onError(new Error('unsupported WebRTC sync protocol'));
      return;
    }
    dataChannel = channel;
    channel.binaryType = 'arraybuffer';
    channel.onopen = () => {
      if (closed || channel !== dataChannel) {
        return;
      }
      drainChannel(channel, sendQueue, wire, close, onError);
    };
    channel.onmessage = (event) => {
      if (closed || channel !== dataChannel) {
        return;
      }
      let parsed;
      try {
        parsed = wire.decode(event.data);
      } catch (error) {
        channel.close();
        onError(error);
        return;
      }
      for (const h of recvHandlers) {
        h(parsed);
      }
    };
  };

  if (initiator) {
    wireChannel(
      pc.createDataChannel(channelLabel, { protocol: wire.protocol })
    );
  } else {
    pc.ondatachannel = (event) => wireChannel(event.channel);
  }

  pc.onicecandidate = (event) => {
    if (!closed && event.candidate) {
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
      await ice.flush();
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
      await ice.flush();
    },
    onError
  );

  const close = () => {
    if (closed) {
      return;
    }
    closed = true;
    sendQueue.clear();
    offOffer();
    offAnswer();
    ice.close();
    closeRtc(dataChannel);
    closeRtc(pc);
  };

  const startAsInitiator = async () => {
    if (closed || awaitingAnswer || dataChannel?.readyState === 'open') {
      return;
    }
    awaitingAnswer = true;
    if (!dataChannel) {
      // Late initiation: open the data channel now if we deferred it.
      wireChannel(
        pc.createDataChannel(channelLabel, { protocol: wire.protocol })
      );
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
      if (closed) {
        throw new Error('WebRTC sync transport is closed');
      }
      const data = wire.encode(event);
      if (dataChannel?.readyState === 'open') {
        dataChannel.send(data);
      } else {
        sendQueue.push(event);
      }
    },
    onMessage: (h) => {
      recvHandlers.add(h);
      return () => recvHandlers.delete(h);
    },
    close,
    startAsInitiator,
    pc,
  };
};
