// The state behind the voice chat bar and panel (R-Y188; learned, never
// copied): the chat's call, its participants, and our own session. Every
// write (join, leave, unmute, raise hand, notify) answers one click.

import { useCallback, useEffect, useRef, useState } from 'react';
import { createVoiceSession, watchLevel } from './voice-chat-session.js';
import { mergedCall, mergedPages } from './voice-chat-model.js';

const GROUP = /^-\d+$/;

/** The chat's call: asked once when the chat opens, then kept live. */
export const useCall = (api, chat, live) => {
  const [asked, setAsked] = useState(null);
  const eligible =
    chat?.source === 'telegram' &&
    GROUP.test(String(chat.chat)) &&
    typeof api?.telegramCallInfo === 'function';
  useEffect(() => {
    setAsked(null);
    if (!eligible) {
      return undefined;
    }
    let current = true;
    api
      .telegramCallInfo({ chat: String(chat.chat) })
      .then(
        (a) => current && a?.ok && setAsked({ call: a.call, at: Date.now() })
      )
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [eligible, chat?.chat]);
  return eligible ? mergedCall(asked, live) : null;
};

/**
 * The participants of a call while `on` (the panel is open or we are in
 * it), asked again whenever Telegram says they changed (`rev`).
 * `[state, more]`; state is `{ phase, items, next, count }`.
 */
export const useParticipants = (api, call, rev, on) => {
  const [state, setState] = useState({ phase: 'loading', items: [] });
  const id = call?.id;
  const ask = (offset) =>
    offset
      ? api.telegramCallParticipants({
          id,
          accessHash: call.accessHash,
          offset,
        })
      : api.telegramCallOpen({ id, accessHash: call.accessHash });
  useEffect(() => {
    if (!on || !id) {
      return undefined;
    }
    let current = true;
    ask(null)
      .then((a) => {
        if (current) {
          setState(
            a?.ok
              ? {
                  phase: 'ready',
                  items: a.participants,
                  next: a.next,
                  count: a.count,
                }
              : { phase: 'error', code: a?.code, items: [] }
          );
        }
      })
      .catch(() => current && setState({ phase: 'error', items: [] }));
    return () => {
      current = false;
    };
  }, [on, id, rev]);
  const more = useCallback(async () => {
    const a = await ask(state.next).catch(() => null);
    if (a?.ok) {
      setState((prev) => ({
        ...prev,
        items: mergedPages(prev.items, a.participants),
        next: a.next,
      }));
    }
  }, [state.next, id]);
  return [state, more];
};

// A hidden home for the audio elements of the incoming tracks.
const audioHome = () => {
  const home = document.createElement('div');
  home.hidden = true;
  home.dataset.voiceAudio = '';
  document.body.append(home);
  return home;
};

const playIn = (home) => (track, stream) => {
  const audio = document.createElement('audio');
  audio.autoplay = true;
  audio.srcObject = stream ?? new globalThis.MediaStream([track]);
  home.append(audio);
  audio.play?.().catch(() => {});
};

const IDLE = { phase: 'idle', code: null, mic: false, hand: false };

/**
 * Our own session in the call: `{ state, join, leave, toggleMic,
 * toggleHand, speaking, sync }`. Leaves when the call is over or the chat
 * changes.
 */
export const useVoiceSession = (api, call) => {
  const [state, setState] = useState(IDLE);
  const [speaking, setSpeaking] = useState(false);
  const live = useRef({ session: null, home: null, stop: null });
  const patch = (next) => setState((prev) => ({ ...prev, ...next }));

  const teardown = () => {
    live.current.stop?.();
    live.current.home?.remove();
    live.current = { session: null, home: null, stop: null };
    setSpeaking(false);
  };

  const leave = async () => {
    const { session } = live.current;
    const left = session ? await session.leave() : { ok: true };
    teardown();
    setState(left?.ok ? IDLE : { ...IDLE, code: left?.code ?? 'failed' });
  };

  const join = async (joinAs) => {
    patch({ phase: 'joining', code: null });
    const home = audioHome();
    const session = createVoiceSession({
      api,
      call,
      joinAs,
      attach: playIn(home),
    });
    live.current = { session, home, stop: null };
    const joined = await session.join();
    if (joined.ok) {
      setState({ ...IDLE, phase: 'joined' });
    } else {
      teardown();
      setState({ ...IDLE, code: joined.code ?? 'failed' });
    }
  };

  const toggleMic = async () => {
    const { session } = live.current;
    if (state.mic) {
      live.current.stop?.();
      live.current.stop = null;
      setSpeaking(false);
      const done = await session.mute();
      patch({ mic: !done?.ok, code: done?.ok ? null : done?.code });
      return;
    }
    const done = await session.unmute();
    if (done?.ok) {
      live.current.stop = watchLevel(session.micStream(), setSpeaking);
    }
    patch({ mic: Boolean(done?.ok), code: done?.ok ? null : done?.code });
  };

  const toggleHand = async () => {
    const done = await live.current.session.raiseHand(!state.hand);
    patch(done?.ok ? { hand: !state.hand, code: null } : { code: done?.code });
  };

  // Listens to these participants (once joined).
  const sync = (participants) => live.current.session?.sync(participants);

  // The call ended or the chat changed: leave quietly.
  useEffect(
    () => () => {
      live.current.session?.leave().catch(() => {});
      teardown();
    },
    [call?.id]
  );

  useEffect(() => {
    if (state.phase === 'joined' && !call) {
      teardown();
      setState(IDLE);
    }
  }, [call, state.phase]);

  return { state, join, leave, toggleMic, toggleHand, speaking, sync };
};
