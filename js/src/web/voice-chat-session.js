// Joining a voice chat from the browser with an RTCPeerConnection
// (R-Y188; learned from how the web clients behave, never copied). Nothing
// here runs by itself: `join` follows a click on Join, `unmute` a click on
// the microphone button (which asks the browser for the microphone).
//
// The flow: a local offer gives the join params (voice-chat-sdp.js);
// phone.joinGroupCall (muted) answers with Telegram's connection JSON,
// which becomes the remote answer; each other participant's stream is
// then added as a receive-only section by renegotiating with a remote
// offer. The incoming tracks are handed to `attach`.

import { joinParamsOf, nextSources, remoteSdpOf } from './voice-chat-sdp.js';

const fail = (code) => ({ ok: false, code });

/**
 * A session for one call. `api` is the page's Telegram API (telegramCallJoin,
 * telegramCallLeave, telegramCallSelf); `Rtc` the RTCPeerConnection class;
 * `getMic()` asks for the microphone; `attach(track, stream)` plays a
 * remote track.
 */
export const createVoiceSession = ({
  api,
  call,
  joinAs,
  Rtc = globalThis.RTCPeerConnection,
  getMic = () =>
    globalThis.navigator.mediaDevices.getUserMedia({ audio: true }),
  attach = () => {},
}) => {
  const key = {
    id: call.id,
    accessHash: call.accessHash,
    ...(joinAs ? { joinAs } : {}),
  };
  let pc = null;
  let sender = null;
  let answer = null;
  let source = null;
  let sources = [];
  let version = 1;
  let mic = null;
  let queue = Promise.resolve();

  const close = () => {
    mic?.getTracks?.().forEach((track) => track.stop());
    mic = null;
    pc?.close();
    pc = null;
  };

  const leaveQuietly = () =>
    api.telegramCallLeave({ ...key, source }).catch(() => {});

  const listen = async () => {
    const remote = remoteSdpOf(answer, { kind: 'answer' });
    await pc.setRemoteDescription({ type: 'answer', sdp: remote });
  };

  const join = async () => {
    if (!Rtc) {
      return fail('unsupported');
    }
    try {
      pc = new Rtc({ bundlePolicy: 'max-bundle', iceServers: [] });
      pc.ontrack = (event) => attach(event.track, event.streams?.[0]);
      sender = pc.addTransceiver('audio', { direction: 'sendrecv' }).sender;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const params = joinParamsOf(pc.localDescription?.sdp ?? offer.sdp);
      if (!params) {
        close();
        return fail('no-params');
      }
      const joined = await api.telegramCallJoin({
        ...key,
        params: JSON.stringify(params),
      });
      if (!joined?.ok) {
        close();
        return joined ?? fail('failed');
      }
      answer = joined.connection;
      source = joined.source;
      try {
        await listen();
      } catch {
        await leaveQuietly();
        close();
        return fail('connect');
      }
      return { ok: true, source };
    } catch {
      close();
      return fail('connect');
    }
  };

  // Listens to these participants: a renegotiation with a remote offer,
  // one at a time.
  const sync = (participants) => {
    queue = queue
      .then(async () => {
        if (!pc || !answer) {
          return;
        }
        const next = nextSources(sources, participants, source);
        if (JSON.stringify(next) === JSON.stringify(sources)) {
          return;
        }
        sources = next;
        version += 1;
        await pc.setRemoteDescription({
          type: 'offer',
          sdp: remoteSdpOf(answer, { kind: 'offer', sources, version }),
        });
        await pc.setLocalDescription(await pc.createAnswer());
      })
      .catch(() => {});
    return queue;
  };

  const leave = async () => {
    if (!pc) {
      return { ok: true };
    }
    const left = await api.telegramCallLeave({ ...key, source });
    close();
    return left ?? fail('failed');
  };

  // Unmuting asks for the microphone, then Telegram; either refusal puts
  // everything back.
  const unmute = async () => {
    if (!pc) {
      return fail('not-joined');
    }
    try {
      mic = await getMic();
    } catch {
      return fail('mic');
    }
    await sender.replaceTrack(mic.getAudioTracks()[0]);
    const done = await api.telegramCallSelf({ ...key, muted: false });
    if (!done?.ok) {
      await mute(false);
    }
    return done ?? fail('failed');
  };

  async function mute(tell = true) {
    mic?.getTracks?.().forEach((track) => track.stop());
    mic = null;
    await sender?.replaceTrack(null);
    return tell ? api.telegramCallSelf({ ...key, muted: true }) : { ok: true };
  }

  const raiseHand = (on) =>
    api.telegramCallSelf({ ...key, muted: true, raiseHand: on });

  return {
    join,
    sync,
    leave,
    unmute,
    mute,
    raiseHand,
    micStream: () => mic,
    source: () => source,
  };
};

// Whether the microphone's level says we are speaking: an analyser on the
// stream, read a few times a second. `onLevel(true|false)` follows it;
// the returned function stops it. Without Web Audio, nothing happens.
const startLevel = (Audio, stream, onLevel, threshold) => {
  const context = new Audio();
  const analyser = context.createAnalyser();
  analyser.fftSize = 512;
  context.createMediaStreamSource(stream).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  const timer = globalThis.setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    const power = samples.reduce((sum, v) => sum + v * v, 0) / samples.length;
    onLevel(Math.sqrt(power) > threshold);
  }, 150);
  return () => {
    globalThis.clearInterval(timer);
    context.close?.().catch(() => {});
  };
};

export const watchLevel = (stream, onLevel, threshold = 0.02) => {
  const Audio = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!Audio || !stream) {
    return () => {};
  }
  try {
    return startLevel(Audio, stream, onLevel, threshold);
  } catch {
    // A stream Web Audio cannot read: no indicator, the call goes on.
    return () => {};
  }
};
