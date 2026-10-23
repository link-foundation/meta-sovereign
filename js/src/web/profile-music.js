// Music on a profile, as Telegram Desktop shows it (R-Y185; learned, never
// copied). A person's info column has "Music" when they saved songs: each
// row has a play button (the chat's audio player, one track at a time), the
// title, the performer and the length. On one's own profile a track can be
// taken off (a click), and "Add to profile music" is in the menu of a
// chat's audio message (see chat-music-save.js).

import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';
import { clockOf, useAudio } from './chat-media.js';
import { trackLine } from './profile-stories-model.js';

const el = React.createElement;

const errorText = (t, code) => {
  const key = `chat.music.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.music.err.failed') : text;
};

/** Whether a chat's info column may show music: a Telegram person. */
export const hasMusic = (chat, api) =>
  chat?.source === 'telegram' &&
  /^\d+$/.test(String(chat.chat)) &&
  typeof api?.telegramSavedMusic === 'function';

// The person's tracks, a page at a time.
const useTracks = (api, chat) => {
  const [state, setState] = useState({
    tracks: [],
    next: null,
    mine: false,
    busy: true,
    code: null,
  });
  const latest = useRef(0);
  const load = (offset) => {
    const mine = ++latest.current;
    setState((s) => ({ ...s, busy: true, code: null }));
    return Promise.resolve(
      api.telegramSavedMusic({ chat, ...(offset ? { offset } : {}) })
    )
      .catch(() => null)
      .then((answer) => {
        if (mine !== latest.current) {
          return;
        }
        setState((s) =>
          answer?.ok
            ? {
                tracks: offset
                  ? [...s.tracks, ...answer.tracks]
                  : answer.tracks,
                next: answer.next ?? null,
                mine: Boolean(answer.mine),
                busy: false,
                code: null,
              }
            : { ...s, busy: false, code: answer?.code ?? 'failed' }
        );
      });
  };
  useEffect(() => {
    setState({ tracks: [], next: null, mine: false, busy: true, code: null });
    load(0);
  }, [api, chat]);
  return [state, load, setState];
};

const Track = ({ api, track, active, onSelect, onRemove, busy }) => {
  const t = useT();
  const [src, setSrc] = useState(null);
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    let live = true;
    api
      .telegramMusicUrl?.({ id: track.id })
      .then((next) => live && setSrc(next ?? null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [api, track.id, active]);
  const player = useAudio(active ? src : null, true);
  const playing = active && player.playing;
  const press = () => (active ? src && player.toggle() : onSelect());
  const length = active && player.length ? player.length : track.duration;
  return el('li', { className: 'music-row', 'data-music': track.id }, [
    el(
      'button',
      {
        key: 'p',
        type: 'button',
        className: 'audio-play',
        'data-action': 'music-play',
        'aria-label': t(playing ? 'chat.media.pause' : 'chat.media.play'),
        onClick: press,
      },
      active && !src
        ? el('span', { className: 'media-spinner small' })
        : el(Icon, { name: playing ? 'pause' : 'play', size: 20 })
    ),
    el('span', { key: 'n', className: 'music-title' }, trackLine(track)),
    el(
      'span',
      { key: 'd', className: 'meta' },
      active && player.at > 0 ? clockOf(player.at) : clockOf(length)
    ),
    onRemove
      ? el(
          'button',
          {
            key: 'r',
            type: 'button',
            className: 'ghost',
            'data-action': 'music-remove',
            disabled: busy,
            onClick: onRemove,
          },
          t('chat.music.remove')
        )
      : null,
  ]);
};

const Section = ({ api, chat }) => {
  const t = useT();
  const [state, load, setState] = useTracks(api, chat);
  const [active, setActive] = useState(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState(null);
  const remove = async (track) => {
    setBusy(true);
    setCode(null);
    const answer = await Promise.resolve(
      api.telegramMusicRemove({ id: track.id })
    ).catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      setState((s) => ({
        ...s,
        tracks: s.tracks.filter((x) => x.id !== track.id),
      }));
    } else {
      setCode(answer?.code ?? 'failed');
    }
  };
  if (state.tracks.length === 0 && !state.mine) {
    return null;
  }
  const failed = code ?? state.code;
  return el(
    'section',
    { className: 'person-section', 'data-music-list': state.tracks.length },
    [
      el('h3', { key: 'h' }, t('chat.music.title')),
      el(
        'ul',
        { key: 'l', className: 'music-list' },
        state.tracks.map((track) =>
          el(Track, {
            key: track.id,
            api,
            track,
            active: active === track.id,
            onSelect: () => setActive(track.id),
            onRemove:
              state.mine && typeof api.telegramMusicRemove === 'function'
                ? () => remove(track)
                : null,
            busy,
          })
        )
      ),
      failed
        ? el(
            'p',
            { key: 'e', className: 'comments-failed', role: 'alert' },
            errorText(t, failed)
          )
        : null,
      state.next && !state.busy
        ? el(
            'button',
            {
              key: 'm',
              type: 'button',
              'data-action': 'music-more',
              onClick: () => load(state.next),
            },
            t('chat.music.more')
          )
        : null,
      state.mine
        ? el('p', { key: 'i', className: 'meta' }, t('chat.music.hint'))
        : null,
    ]
  );
};

/** The person's saved songs in the info column, or nothing without any. */
export const MusicRow = ({ api, chat }) =>
  hasMusic(chat, api) ? el(Section, { api, chat: String(chat.chat) }) : null;
