// What a message carries besides text, drawn as Telegram's apps draw it
// (telegram-tt `Video`, `RoundVideo`, `Voice`, `Audio`, `Sticker`,
// `Document`, `Location`, `Contact`, `Poll`): a video shows its blurred
// preview, then its frame, with a play button and how long it is, and
// plays in place; a GIF plays muted in a loop while it is on screen; a
// round video in a circle; a voice note as a waveform; a sticker with no
// bubble. Files come from the server, which reads each once and keeps it
// (`/api/telegram/file`, `/api/telegram/media` for previews); nothing is
// fetched before it is near the screen, nor when the automatic download
// settings (./auto-download.js, R-Y181) do not allow it: such media shows
// a download button with its size.

import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';
import { PipButton, usePip } from './chat-pip.js';
import { AttachedButton } from './chat-attached-button.js';
import { Checklist, Poll } from './chat-poll.js';
import { GiveawayCard, GiveawayResultsCard } from './chat-giveaway.js';
import { GiftCodeCard } from './chat-gift-code-button.js';
import { strippedJpegDataUrl } from './message-parts.js';
import { crossOriginFor, mediaSrc, saveUrl } from './media-src.js';
import { headingDegrees, leftLine, liveLines } from './live-place.js';
import { useNowSeconds } from './live-clock.js';
import { useAutoLoad } from './auto-download.js';
import { LottieSticker } from './lottie-sticker.js';
import {
  Transcribable,
  TranscribeButton,
  useTranscribe,
} from './chat-transcribe.js';

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
export const useUrl = (api, method, args, when) => {
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
export const Poster = ({ media, thumb }) => {
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

// The play button (a download button with the size when the file is not
// loaded by itself), the spinner while it loads, the length (or "GIF").
const videoControls = (
  t,
  { media, gif, playing, file, still, manual, play }
) => [
  still && !playing
    ? el(
        'button',
        {
          key: 'play',
          type: 'button',
          className: manual ? 'media-play media-download' : 'media-play',
          'aria-label': t('chat.media.play'),
          'data-download': manual ? 'manual' : undefined,
          onClick: play,
        },
        manual && media.size
          ? [
              el(Icon, { key: 'i', name: 'download', size: 22 }),
              el(
                'span',
                { key: 's', className: 'media-size' },
                sizeOf(media.size)
              ),
            ]
          : el(Icon, { name: 'play', size: 28 })
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

// How a video behaves under the download settings (R-Y181): a GIF plays by
// itself with "Autoplay GIFs", a video with "Autoplay videos" once it is
// allowed; both are muted loops (`quiet`). `fetchNear`: its file is
// fetched when it nears the screen.
export const videoMode = (gif, playing, load) => {
  const gifAuto = gif && load.autoplayGif;
  const videoAuto = !gif && load.autoplayVideo && load.allowed;
  return {
    gifAuto,
    quiet: !playing && (gifAuto || videoAuto),
    fetchNear: gifAuto || (!gif && load.allowed),
  };
};

// The <video> itself: a muted loop when `silent`, else with controls.
const videoElement = ({ file, thumb, silent, videoRef }) =>
  el('video', {
    key: `video-${silent}`,
    ref: videoRef,
    className: 'media-video',
    ...mediaSrc(file),
    poster: thumb ?? undefined,
    autoPlay: true,
    muted: silent,
    loop: silent,
    playsInline: true,
    controls: !silent,
    preload: 'auto',
  });

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
  // R-Y181: whether the file comes by itself, and whether it plays so.
  const load = useAutoLoad(gif ? 'file' : 'video', media.size);
  const { gifAuto, quiet, fetchNear } = videoMode(gif, playing, load);
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
    playing || (near && fetchNear)
  );
  const video = file && (playing || (quiet && visible));
  const silent = gif || quiet;
  // Picture-in-picture where the browser has it (R-Y182).
  const videoRef = useRef(null);
  const pip = usePip(videoRef, Boolean(video));
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
      video ? videoElement({ file, thumb, silent, videoRef }) : null,
      ...videoControls(t, {
        media,
        gif,
        playing,
        file,
        still: !gifAuto && !quiet,
        manual: !load.auto,
        play: () => {
          load.ask();
          setPlaying(true);
        },
      }),
      !gif && video ? el(PipButton, { key: 'pip', pip }) : null,
      // "Stickers in this video" (R-Y206).
      el(AttachedButton, { key: 'stickers', api, media, chat, msgId }),
    ]
  );
};

// Play/pause of one <audio>, its position and length.
export const useAudio = (src, autoplay = true) => {
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
    if (autoplay) {
      player.play().catch(() => {});
    }
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

// R-Y181: a voice note or a song is fetched when near the screen if the
// download settings allow it, else when the user asks.
const useAudioFile = ({ media, api, chat, msgId }, box) => {
  const [wanted, setWanted] = useState(false);
  const { near } = useNearView(box);
  const load = useAutoLoad(
    media.type === 'voice' ? 'voice' : 'file',
    media.size
  );
  const src = useUrl(
    api,
    'telegramFileUrl',
    { chat, id: msgId },
    wanted || (near && load.allowed)
  );
  return { load, src, wanted, setWanted };
};

// A voice note's waveform (played bars marked), or a song's title.
const AudioLabel = ({ media, voice, done, t }) =>
  voice
    ? el(
        'span',
        { className: 'audio-wave', 'aria-hidden': 'true' },
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
        { className: 'audio-title' },
        [media.title, media.performer].filter(Boolean).join(' — ') ||
          media.filename ||
          t('chat.media.audio')
      );

/** A voice note or a song: a play button, its waveform or title. */
export const MediaAudio = ({ media, api, chat, msgId }) => {
  const t = useT();
  const voice = media.type === 'voice';
  const box = useRef(null);
  const { load, src, wanted, setWanted } = useAudioFile(
    { media, api, chat, msgId },
    box
  );
  const player = useAudio(src, wanted);
  const length = player.length || media.duration || 0;
  const done = length > 0 ? player.at / length : 0;
  // Not loaded by itself: it says how big it is.
  const waiting = !load.auto && !src && Boolean(media.size);
  const press = () => {
    load.ask();
    return src ? player.toggle() : setWanted(true);
  };
  // "→A" beside a voice note's waveform, its text under it (R-Y175).
  const words = useTranscribe({ api, chat, msgId, enabled: voice });
  const row = el(
    'div',
    {
      key: 'row',
      ref: box,
      className: voice ? 'bubble-audio voice' : 'bubble-audio',
      'data-download': waiting ? 'manual' : undefined,
    },
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
        el(AudioLabel, { key: 'label', media, voice, done, t }),
        el(
          'span',
          { key: 'time', className: 'audio-time' },
          player.at > 0 ? clockOf(player.at) : clockOf(length),
          waiting ? ` · ${sizeOf(media.size)}` : ''
        ),
      ]),
      el(TranscribeButton, { key: 'words', state: words }),
    ]
  );
  return el(Transcribable, { state: words }, row);
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

/**
 * A file: its icon, name and size; a click saves it. A file the automatic
 * download settings allow is fetched when near the screen (R-Y181), so the
 * click saves at once; any other is fetched on the click.
 */
export const MediaFile = ({ media, api, chat, msgId }) => {
  const t = useT();
  const [wanted, setWanted] = useState(false);
  const box = useRef(null);
  const { near } = useNearView(box);
  const load = useAutoLoad('file', media.size);
  const src = useUrl(
    api,
    'telegramFileUrl',
    { chat, id: msgId },
    wanted || (near && load.allowed)
  );
  useEffect(() => {
    if (src && wanted) {
      saveUrl(src, media.filename || '');
    }
  }, [src, wanted]);
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
        ? el(
            'span',
            {
              key: 's',
              className: 'file-size',
              'data-download': load.auto || src ? undefined : 'manual',
            },
            sizeOf(media.size)
          )
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
      ref: box,
      type: 'button',
      className: 'bubble-doc',
      disabled: !msgId || wanted,
      onClick: () => setWanted(true),
      'aria-label': t('chat.media.save', { name: label }),
    },
    body
  );
};

export const mapLink = (lat, lon) =>
  `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`;

// What opens a place: the map site, in a new tab.
const placeLink = (media) => ({
  href: mapLink(media.lat, media.lon),
  target: '_blank',
  rel: 'noopener noreferrer',
});

// The map picture's size and zoom; sharper on hi-dpi screens (R-Y131).
export const MAP_SHOT = { w: 300, h: 150, zoom: 15 };
const mapScale = () =>
  Math.min(3, Math.max(1, Math.round(globalThis.devicePixelRatio || 1)));

// The place's map picture from the server, or null (none yet, or it failed).
export const useMapUrl = (api, media, off) => {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (off || typeof api?.telegramMapUrl !== 'function') {
      return undefined;
    }
    const { lat, lon, hash } = media;
    const stop = new AbortController();
    api
      .telegramMapUrl({ lat, lon, hash, ...MAP_SHOT, scale: mapScale() })
      .then((next) => stop.signal.aborted || setUrl(next ?? null))
      .catch(() => {});
    return () => stop.abort();
  }, [api, media.lat, media.lon, media.hash, off]);
  return url;
};

const PIN_PATH =
  'M12 1C6 1 1.5 5.6 1.5 11.4 1.5 19 12 31 12 31s10.5-12 10.5-19.6C22.5 5.6 18 1 12 1z';

// A place as Telegram Desktop draws it: the map with a pin in its
// middle; a venue's title and address, or "Live location", under it.
const PlaceMap = ({ media, url, onError }) => {
  const t = useT();
  // A live place's "N min left" and "updated X ago" follow the clock (R-Y197).
  const now = useNowSeconds(Boolean(media.live));
  const heading = media.live ? headingDegrees(media) : null;
  const lines = [
    media.live ? t('chat.media.livePlace') : null,
    ...(media.live ? liveLines(t, media, now) : []),
    media.live ? leftLine(t, media, now) : null,
    media.title,
    media.address,
  ].filter(Boolean);
  return el(
    'a',
    {
      className: 'bubble-place',
      'data-place-map': '',
      title: t('chat.media.mapOpen'),
      ...placeLink(media),
    },
    [
      el('span', { key: 'm', className: 'place-map' }, [
        el('img', {
          key: 'i',
          ...mediaSrc(url),
          alt: '',
          width: MAP_SHOT.w,
          height: MAP_SHOT.h,
          draggable: false,
          onError,
        }),
        el('svg', { key: 'p', className: 'place-pin', viewBox: '0 0 24 32' }, [
          el('path', { key: 'a', d: PIN_PATH }),
          el('circle', { key: 'c', cx: 12, cy: 11.5, r: 4 }),
        ]),
        heading === null
          ? null
          : el(
              'svg',
              {
                key: 'h',
                className: 'place-heading',
                viewBox: '0 0 24 24',
                'data-heading': heading,
                style: { transform: `rotate(${heading}deg)` },
              },
              el('path', { d: 'M12 2l6 18-6-4-6 4z' })
            ),
      ]),
      lines.length
        ? el(
            'span',
            { key: 'l', className: 'place-lines' },
            lines.map((line, i) =>
              el(
                'span',
                { key: i, className: i === 0 ? 'place-title' : 'meta' },
                line
              )
            )
          )
        : null,
    ]
  );
};

/** A place: the map picture, else the plain card (R-Y131). */
const PlaceCard = ({ media, api }) => {
  const [failed, setFailed] = useState(false);
  const where = media.lat !== null && media.lon !== null;
  const url = useMapUrl(api, media, failed || !where);
  return url && !failed
    ? el(PlaceMap, { media, url, onError: () => setFailed(true) })
    : el(PlaceFallback, { media });
};

/** A place's plain card; a contact, a die, a story… follow (polls: ./chat-poll.js). */
const PlaceFallback = ({ media }) => {
  const t = useT();
  const where = media.lat !== null && media.lon !== null;
  return el(
    'a',
    {
      className: 'bubble-card place',
      ...(where ? placeLink(media) : { target: '_blank', rel: 'noopener' }),
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

// "Add to contacts" under a card from someone else: the name on the card,
// split into first and last (R-Y142).
const AddContact = ({ media, api }) => {
  const t = useT();
  const [state, setState] = useState('idle');
  const [first, ...rest] = String(media.name ?? '').split(' ');
  const add = async () => {
    setState('busy');
    const answer = await api
      .telegramPeerContact({
        chat: media.userId,
        add: true,
        firstName: first || media.phone || '?',
        lastName: rest.join(' '),
      })
      .catch(() => null);
    setState(answer?.ok ? 'done' : 'failed');
  };
  return state === 'done'
    ? el(
        'span',
        { className: 'meta', 'data-contact-added': '' },
        t('chat.media.contactAdded')
      )
    : el(
        'button',
        {
          type: 'button',
          className: 'card-action',
          'data-action': 'contact-add',
          disabled: state === 'busy',
          onClick: add,
        },
        state === 'failed'
          ? t('chat.media.contactFailed')
          : t('chat.media.contactAdd')
      );
};

const ContactCard = ({ media, api, mine }) => {
  const t = useT();
  const canAdd =
    media.userId && !mine && typeof api?.telegramPeerContact === 'function';
  return el('div', { className: 'bubble-card contact' }, [
    el(Icon, { key: 'i', name: 'user', size: 20 }),
    el('span', { key: 't', className: 'card-lines' }, [
      el('strong', { key: 'n' }, media.name ?? t('chat.media.contact')),
      media.phone
        ? el('a', { key: 'p', href: `tel:${media.phone}` }, media.phone)
        : null,
      canAdd ? el(AddContact, { key: 'a', media, api }) : null,
    ]),
  ]);
};

const DiceCard = ({ media }) =>
  el('div', { className: 'bubble-dice', title: String(media.value ?? '') }, [
    el('span', { key: 'e', className: 'dice-emoji' }, media.emoticon),
    media.value
      ? el('span', { key: 'v', className: 'dice-value' }, String(media.value))
      : null,
  ]);

// A die as Telegram's apps draw it (R-Y130): the animation of its set
// (asked once a page) that rolls to its value — played once for a die
// just thrown, shown at rest on its value for an older one. The slot
// machine, built of many parts, stays a card.
const ROLLING = new Set(['🎲', '🎯', '🏀', '⚽', '🎳']);
const FRESH_S = 30;
const diceSets = new Map();
const diceSet = (api, emoticon) => {
  if (!diceSets.has(emoticon)) {
    const asked = Promise.resolve(api.telegramDice({ emoticon }))
      .catch(() => null)
      .then((answer) => {
        if (!answer?.ok) {
          diceSets.delete(emoticon);
        }
        return answer?.ok ? answer : null;
      });
    diceSets.set(emoticon, asked);
  }
  return diceSets.get(emoticon);
};

const useDiceFile = (api, media, when) => {
  const [file, setFile] = useState(null);
  useEffect(() => {
    const usable =
      when &&
      ROLLING.has(media.emoticon) &&
      typeof api?.telegramDice === 'function' &&
      typeof api?.telegramStickerUrl === 'function';
    if (!usable) {
      return undefined;
    }
    let live = true;
    diceSet(api, media.emoticon)
      .then((set) => {
        const item = set?.items?.[media.value ?? 0];
        return item?.format === 'tgs'
          ? api.telegramStickerUrl({ id: item.id, full: true })
          : null;
      })
      .then((url) => live && setFile(url ?? null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [api, media.emoticon, media.value, when]);
  return file;
};

const lessMotion = () =>
  globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

const Dice = ({ media, api }) => {
  const ref = useRef(null);
  const { near, visible } = useNearView(ref);
  const file = useDiceFile(api, media, near);
  const [drawn, setDrawn] = useState(false);
  const [fresh] = useState(
    () =>
      Boolean(media.sent) &&
      Date.now() / 1000 - media.sent < FRESH_S &&
      !lessMotion()
  );
  return el(
    'div',
    {
      ref,
      className: 'bubble-sticker bubble-die',
      title: String(media.value ?? ''),
      'data-dice': media.emoticon,
    },
    [
      file
        ? el(LottieSticker, {
            key: 'l',
            src: file,
            play: visible,
            loop: false,
            end: !fresh,
            onReady: setDrawn,
          })
        : null,
      drawn ? null : el(DiceCard, { key: 'c', media }),
    ]
  );
};

const NoteCard = ({ media }) => {
  const t = useT();
  return el(
    'div',
    { className: 'bubble-card note' },
    t(`chat.media.${media.kind}`, { title: media.title ?? '' })
  );
};

// A live stream (R-Y221): its card only names it; a tap opens nothing.
const LiveStreamCard = ({ media }) => {
  const t = useT();
  return el(
    'div',
    { className: 'bubble-card live-stream', 'data-live-stream': '' },
    [
      el('span', { key: 'd', className: 'live-dot', 'aria-hidden': 'true' }),
      el(
        'strong',
        { key: 't' },
        t(media.rtmp ? 'chat.liveStreamRtmp' : 'chat.liveStream')
      ),
    ]
  );
};

const CARDS = {
  'live-stream': LiveStreamCard,
  place: PlaceCard,
  contact: ContactCard,
  poll: Poll,
  todo: Checklist,
  dice: Dice,
  // Giveaways (R-Y184).
  giveaway: GiveawayCard,
  'giveaway-results': GiveawayResultsCard,
  // A gift code (R-Y193).
  'gift-code': GiftCodeCard,
};

/** A card; a poll or checklist acts on its message (`chat`, `msgId`). */
export const MediaCard = ({ media, api, chat, msgId, mine }) =>
  el(CARDS[media.kind] ?? NoteCard, { media, api, chat, msgId, mine });
