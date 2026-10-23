// What a message carries besides text, drawn as Telegram's apps draw it
// (telegram-tt `Video`, `RoundVideo`, `Voice`, `Audio`, `Sticker`,
// `Document`, `Location`, `Contact`, `Poll`): a video shows its blurred
// preview, then its frame, with a play button and how long it is, and
// plays in place; a GIF plays muted in a loop while it is on screen; a
// round video in a circle; a voice note as a waveform; a sticker with no
// bubble. Files come from the server, which reads each once and keeps it
// (`/api/telegram/file`, `/api/telegram/media` for previews); nothing is
// fetched before it is near the screen.

import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';
import { Checklist, Poll } from './chat-poll.js';
import { strippedJpegDataUrl } from './message-parts.js';
import { crossOriginFor, mediaSrc, saveUrl } from './media-src.js';
import { LottieSticker } from './lottie-sticker.js';

const el = React.createElement;

/** `m:ss` or `h:mm:ss`. */
export const clockOf = (seconds) => {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
};

/** 1.2 MB, 340 KB. */
export const sizeOf = (bytes) => {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) {
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }
  return n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`;
};

// True once `ref` comes within a screen of the view (and stays true);
// `visible` follows whether it is on screen now.
export const useNearView = (ref) => {
  const [near, setNear] = useState(false);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = ref.current;
    const Observer = globalThis.IntersectionObserver;
    if (!node || typeof Observer !== 'function') {
      setNear(true);
      return undefined;
    }
    const observer = new Observer(
      (entries) => {
        const shown = entries.some((e) => e.isIntersecting);
        setVisible(shown);
        if (shown) {
          setNear(true);
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return { near, visible };
};

// A URL from `api[method](args)` once `when` is true.
const useUrl = (api, method, args, when) => {
  const [url, setUrl] = useState(null);
  const key = JSON.stringify(args);
  useEffect(() => {
    if (!when || typeof api?.[method] !== 'function' || !args.chat) {
      return undefined;
    }
    let active = true;
    api[method](args)
      .then((next) => active && setUrl(next ?? null))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [api, method, key, when]);
  return url;
};

const previewOf = (media) =>
  media?.strippedB64 ? strippedJpegDataUrl(media.strippedB64) : null;

// The frame under a video or GIF: its blurred preview, then its thumbnail.
const Poster = ({ media, thumb }) => {
  const preview = previewOf(media);
  const src = thumb || preview;
  return src
    ? el('img', {
        className: thumb ? 'media-poster' : 'media-poster blurred',
        ...mediaSrc(src),
        alt: '',
        draggable: false,
      })
    : null;
};

const boxStyle = (media, max = 320) => {
  const ratio = media?.aspectRatio > 0 ? media.aspectRatio : 16 / 9;
  // Tall videos are not taller than wide ones are wide.
  const width = ratio >= 1 ? max : Math.max(160, Math.round(max * ratio));
  return { width: `${width}px`, aspectRatio: String(ratio) };
};

const videoStyle = (media, fill) =>
  fill ? { width: '100%', height: '100%' } : boxStyle(media);

// The play button, the spinner while it loads, the length (or "GIF").
const videoControls = (t, { media, gif, playing, file, setPlaying }) => [
  !gif && !playing
    ? el(
        'button',
        {
          key: 'play',
          type: 'button',
          className: 'media-play',
          'aria-label': t('chat.media.play'),
          onClick: () => setPlaying(true),
        },
        el(Icon, { name: 'play', size: 28 })
      )
    : null,
  playing && !file
    ? el('span', { key: 'wait', className: 'media-spinner' })
    : null,
  !playing
    ? el(
        'span',
        { key: 'badge', className: 'media-badge' },
        gif ? 'GIF' : clockOf(media.duration)
      )
    : null,
];

/**
 * A video: plays in place on a click; a GIF plays muted while seen.
 * `fill`: as large as the album tile it is in.
 */
export const MediaVideo = ({ media, api, chat, msgId, fill = false }) => {
  const t = useT();
  const ref = useRef(null);
  const { near, visible } = useNearView(ref);
  const gif = media.type === 'gif';
  const [playing, setPlaying] = useState(false);
  const thumb = useUrl(
    api,
    'telegramMediaUrl',
    { chat, id: msgId, size: 'm' },
    near && media.hasThumb
  );
  const file = useUrl(
    api,
    'telegramFileUrl',
    { chat, id: msgId },
    gif ? near : playing
  );
  const video = file && (gif ? visible || playing : playing);
  return el(
    'div',
    {
      ref,
      className: gif ? 'bubble-video gif' : 'bubble-video',
      // In an album it fills its tile (./chat-album.js).
      style: videoStyle(media, fill),
    },
    [
      el(Poster, { key: 'poster', media, thumb }),
      video
        ? el('video', {
            key: 'video',
            className: 'media-video',
            ...mediaSrc(file),
            poster: thumb ?? undefined,
            autoPlay: true,
            muted: gif,
            loop: gif,
            playsInline: true,
            controls: !gif,
            preload: 'auto',
          })
        : null,
      ...videoControls(t, { media, gif, playing, file, setPlaying }),
    ]
  );
};

/** A round video message: a circle that plays with sound on a click. */
export const MediaRound = ({ media, api, chat, msgId }) => {
  const t = useT();
  const ref = useRef(null);
  const { near } = useNearView(ref);
  const [playing, setPlaying] = useState(false);
  const thumb = useUrl(
    api,
    'telegramMediaUrl',
    { chat, id: msgId, size: 'm' },
    near && media.hasThumb
  );
  const file = useUrl(api, 'telegramFileUrl', { chat, id: msgId }, near);
  return el(
    'div',
    {
      ref,
      className: 'bubble-round',
      role: 'button',
      tabIndex: 0,
      'aria-label': t(playing ? 'chat.media.pause' : 'chat.media.play'),
      onClick: () => setPlaying((p) => !p),
      onKeyDown: (e) => e.key === 'Enter' && setPlaying((p) => !p),
    },
    [
      el(Poster, { key: 'poster', media, thumb }),
      file
        ? el(RoundPlayer, {
            key: 'v',
            src: file,
            playing,
            onEnd: () => setPlaying(false),
          })
        : null,
      el(
        'span',
        { key: 'badge', className: 'media-badge' },
        clockOf(media.duration)
      ),
    ]
  );
};

// Muted and looping until clicked, then from the start with sound.
const RoundPlayer = ({ src, playing, onEnd }) => {
  const ref = useRef(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) {
      return;
    }
    video.muted = !playing;
    video.loop = !playing;
    if (playing) {
      video.currentTime = 0;
    }
    video.play?.()?.catch?.(() => {});
  }, [playing]);
  return el('video', {
    ref,
    className: 'media-video',
    ...mediaSrc(src),
    autoPlay: true,
    muted: true,
    loop: true,
    playsInline: true,
    onEnded: onEnd,
  });
};

// Play/pause of one <audio>, its position and length.
const useAudio = (src) => {
  const audio = useRef(null);
  const [state, setState] = useState({ playing: false, at: 0, length: 0 });
  useEffect(() => {
    if (!src) {
      return undefined;
    }
    const player = new globalThis.Audio();
    player.crossOrigin = crossOriginFor(src) ?? null;
    player.src = src;
    audio.current = player;
    const update = () =>
      setState({
        playing: !player.paused,
        at: player.currentTime || 0,
        length: Number.isFinite(player.duration) ? player.duration : 0,
      });
    const events = ['play', 'pause', 'timeupdate', 'ended', 'loadedmetadata'];
    for (const name of events) {
      player.addEventListener(name, update);
    }
    player.play().catch(() => {});
    return () => {
      player.pause();
      for (const name of events) {
        player.removeEventListener(name, update);
      }
    };
  }, [src]);
  const toggle = () => {
    const player = audio.current;
    if (player) {
      if (player.paused) {
        player.play().catch(() => {});
      } else {
        player.pause();
      }
    }
  };
  return { ...state, toggle };
};

const BARS = 48;

// The waveform's samples, spread over BARS bars.
const barsOf = (waveform) => {
  if (!waveform?.length) {
    return Array.from({ length: BARS }, () => 4);
  }
  return Array.from({ length: BARS }, (_, i) => {
    const from = Math.floor((i * waveform.length) / BARS);
    const to = Math.max(
      from + 1,
      Math.floor(((i + 1) * waveform.length) / BARS)
    );
    return Math.max(...waveform.slice(from, to));
  });
};

/** A voice note or a song: a play button, its waveform or title. */
export const MediaAudio = ({ media, api, chat, msgId }) => {
  const t = useT();
  const [wanted, setWanted] = useState(false);
  const src = useUrl(api, 'telegramFileUrl', { chat, id: msgId }, wanted);
  const player = useAudio(src);
  const length = player.length || media.duration || 0;
  const done = length > 0 ? player.at / length : 0;
  const voice = media.type === 'voice';
  const press = () => (src ? player.toggle() : setWanted(true));
  return el(
    'div',
    { className: voice ? 'bubble-audio voice' : 'bubble-audio' },
    [
      el(
        'button',
        {
          key: 'play',
          type: 'button',
          className: 'audio-play',
          'aria-label': t(
            player.playing ? 'chat.media.pause' : 'chat.media.play'
          ),
          onClick: press,
        },
        wanted && !src
          ? el('span', { className: 'media-spinner small' })
          : el(Icon, { name: player.playing ? 'pause' : 'play', size: 20 })
      ),
      el('div', { key: 'body', className: 'audio-body' }, [
        voice
          ? el(
              'span',
              { key: 'wave', className: 'audio-wave', 'aria-hidden': 'true' },
              barsOf(media.waveform).map((v, i) =>
                el('i', {
                  key: i,
                  className: i / BARS < done ? 'played' : undefined,
                  style: { height: `${Math.max(2, (v / 31) * 100)}%` },
                })
              )
            )
          : el(
              'span',
              { key: 'title', className: 'audio-title' },
              [media.title, media.performer].filter(Boolean).join(' — ') ||
                media.filename ||
                t('chat.media.audio')
            ),
        el(
          'span',
          { key: 'time', className: 'audio-time' },
          player.at > 0 ? clockOf(player.at) : clockOf(length)
        ),
      ]),
    ]
  );
};

// What shows of a sticker while nothing plays: its picture, its blurred
// preview or its emoji.
const StillSticker = ({ picture, preview, emoji }) =>
  (picture ?? preview)
    ? el('img', { ...mediaSrc(picture ?? preview), alt: emoji ?? '' })
    : el('span', { className: 'sticker-emoji' }, emoji ?? '🖼');

// An animated sticker (R-Y113): its picture until the animation draws.
const AnimatedSticker = ({ media, api, chat, msgId, onOpen }) => {
  const ref = useRef(null);
  const { near, visible } = useNearView(ref);
  const [drawn, setDrawn] = useState(false);
  const picture = useUrl(
    api,
    'telegramMediaUrl',
    { chat, id: msgId, size: 'm' },
    near
  );
  const file = useUrl(api, 'telegramFileUrl', { chat, id: msgId }, near);
  return el(
    'div',
    {
      ref,
      className: onOpen ? 'bubble-sticker has-set' : 'bubble-sticker',
      title: media.emoji ?? undefined,
      onClick: onOpen ?? undefined,
    },
    [
      file
        ? el(LottieSticker, {
            key: 'l',
            src: file,
            play: visible,
            onReady: setDrawn,
          })
        : null,
      drawn
        ? null
        : el(StillSticker, {
            key: 's',
            picture,
            preview: previewOf(media),
            emoji: media.emoji,
          }),
    ]
  );
};

// A still sticker, or a video one looping while on screen.
const PlainSticker = ({ media, api, chat, msgId, onOpen }) => {
  const ref = useRef(null);
  const { near, visible } = useNearView(ref);
  const webm = media.stickerFormat === 'webm';
  const picture = useUrl(
    api,
    'telegramMediaUrl',
    { chat, id: msgId, size: 'm' },
    near && !webm
  );
  const video = useUrl(
    api,
    'telegramFileUrl',
    { chat, id: msgId },
    near && webm
  );
  return el(
    'div',
    {
      ref,
      className: onOpen ? 'bubble-sticker has-set' : 'bubble-sticker',
      title: media.emoji ?? undefined,
      onClick: onOpen ?? undefined,
    },
    video && visible
      ? el('video', {
          ...mediaSrc(video),
          autoPlay: true,
          muted: true,
          loop: true,
          playsInline: true,
        })
      : el(StillSticker, {
          picture,
          preview: previewOf(media),
          emoji: media.emoji,
        })
  );
};

/**
 * A sticker: a picture, a looping video or an animation (R-Y113), with
 * no bubble; `onOpen` is a click on it (R-Y124).
 */
export const MediaSticker = (props) =>
  el(
    props.media.stickerFormat === 'tgs' ? AnimatedSticker : PlainSticker,
    props
  );

/** A file: its icon, name and size; a click saves it. */
export const MediaFile = ({ media, api, chat, msgId }) => {
  const t = useT();
  const [wanted, setWanted] = useState(false);
  const src = useUrl(api, 'telegramFileUrl', { chat, id: msgId }, wanted);
  useEffect(() => {
    if (src) {
      saveUrl(src, media.filename || '');
    }
  }, [src]);
  const label = media.filename || media.mimeType || t('chat.document');
  // Another network's attachment opens where that network keeps it.
  const href = /^https:\/\//.test(media.url ?? '') ? media.url : null;
  const ext = (media.filename?.split('.').pop() ?? '').slice(0, 4);
  const body = [
    el(
      'span',
      { key: 'ic', className: 'file-icon' },
      ext || el(Icon, { name: 'file', size: 20 })
    ),
    el('span', { key: 'n', className: 'file-lines' }, [
      el('span', { key: 'n', className: 'bubble-doc-name' }, label),
      media.size
        ? el('span', { key: 's', className: 'file-size' }, sizeOf(media.size))
        : null,
    ]),
  ];
  if (href) {
    return el(
      'a',
      {
        className: 'bubble-doc',
        href,
        target: '_blank',
        rel: 'noopener noreferrer',
      },
      body
    );
  }
  return el(
    'button',
    {
      type: 'button',
      className: 'bubble-doc',
      disabled: !msgId || wanted,
      onClick: () => setWanted(true),
      'aria-label': t('chat.media.save', { name: label }),
    },
    body
  );
};

const mapLink = (lat, lon) =>
  `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`;

/** A place, a contact, a die, a story… as a card (polls: ./chat-poll.js). */
const PlaceCard = ({ media }) => {
  const t = useT();
  const where = media.lat !== null && media.lon !== null;
  return el(
    'a',
    {
      className: 'bubble-card place',
      href: where ? mapLink(media.lat, media.lon) : undefined,
      target: '_blank',
      rel: 'noopener noreferrer',
    },
    [
      el(Icon, { key: 'i', name: 'map-pin', size: 20 }),
      el('span', { key: 't', className: 'card-lines' }, [
        el(
          'strong',
          { key: 'n' },
          media.title ??
            t(media.live ? 'chat.media.livePlace' : 'chat.media.place')
        ),
        el(
          'span',
          { key: 'a', className: 'meta' },
          media.address ??
            (where ? `${media.lat.toFixed(5)}, ${media.lon.toFixed(5)}` : '')
        ),
      ]),
    ]
  );
};

const ContactCard = ({ media }) => {
  const t = useT();
  return el('div', { className: 'bubble-card contact' }, [
    el(Icon, { key: 'i', name: 'user', size: 20 }),
    el('span', { key: 't', className: 'card-lines' }, [
      el('strong', { key: 'n' }, media.name ?? t('chat.media.contact')),
      media.phone
        ? el('a', { key: 'p', href: `tel:${media.phone}` }, media.phone)
        : null,
    ]),
  ]);
};

const Dice = ({ media }) =>
  el('div', { className: 'bubble-dice', title: String(media.value ?? '') }, [
    el('span', { key: 'e', className: 'dice-emoji' }, media.emoticon),
    media.value
      ? el('span', { key: 'v', className: 'dice-value' }, String(media.value))
      : null,
  ]);

const NoteCard = ({ media }) => {
  const t = useT();
  return el(
    'div',
    { className: 'bubble-card note' },
    t(`chat.media.${media.kind}`, { title: media.title ?? '' })
  );
};

const CARDS = {
  place: PlaceCard,
  contact: ContactCard,
  poll: Poll,
  todo: Checklist,
  dice: Dice,
};

/** A card; a poll or checklist acts on its message (`chat`, `msgId`). */
export const MediaCard = ({ media, api, chat, msgId, mine }) =>
  el(CARDS[media.kind] ?? NoteCard, { media, api, chat, msgId, mine });
