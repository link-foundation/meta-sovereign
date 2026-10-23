// The full-screen story viewer, as Telegram Desktop's (R-Y140; learned,
// never copied): a bar per story on top, the peer and how old the story
// is, the picture (5 seconds) or the video (to its end), the caption with
// its formatting. The right half goes on, the left half back, past the
// last story the next peer's, past the last peer it closes; Escape or ×
// closes, Space pauses. Media areas, reactions and replies are not here.

import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';
import { MessageText } from './message-text.js';
import { mediaSrc } from './media-src.js';
import { PeerAvatar } from './peer-avatar.js';
import {
  PHOTO_MS,
  agoParts,
  nextPosition,
  previousPosition,
  showMs,
  startIndex,
} from './stories-model.js';

const el = React.createElement;

// Tests shorten the photo's time: globalThis.__STORY_PHOTO_MS__ = 600.
const photoTime = () => Number(globalThis.__STORY_PHOTO_MS__) || PHOTO_MS;

// The stories of the peers, each loaded when it is reached (and the next
// one read ahead): peer id -> { status, stories, code }.
const useStoryLists = (api, peers, at) => {
  const [lists, setLists] = useState({});
  const alive = useRef(true);
  useEffect(() => () => (alive.current = false), []);
  useEffect(() => {
    for (const peer of [peers[at], peers[at + 1]].filter(Boolean)) {
      if (lists[peer.peer] || typeof api?.telegramStoriesPeer !== 'function') {
        continue;
      }
      setLists((held) => ({ ...held, [peer.peer]: { status: 'loading' } }));
      api
        .telegramStoriesPeer({ chat: peer.peer })
        .then((answer) => ({
          status: answer?.ok ? 'ok' : 'error',
          stories: answer?.stories ?? [],
          code: answer?.code ?? 'failed',
        }))
        .catch(() => ({ status: 'error', stories: [], code: 'failed' }))
        .then(
          (entry) =>
            alive.current &&
            setLists((held) => ({ ...held, [peer.peer]: entry }))
        );
    }
  }, [api, peers, at]);
  return lists;
};

// The address of a story's picture or video.
const useStoryUrl = (api, peer, story) => {
  const [url, setUrl] = useState(null);
  const key = story ? `${peer}:${story.id}` : '';
  useEffect(() => {
    setUrl(null);
    if (!story || story.media?.kind === 'none') {
      return undefined;
    }
    let live = true;
    api
      ?.telegramStoryUrl?.({ peer, id: story.id })
      .then((next) => live && setUrl(next ?? null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [api, key]);
  return url;
};

// How far through its time the story is: a picture's clock runs while
// it is loaded and not paused; a video reports its own (`setProgress`).
const useClock = ({ key, ms, running, onEnd }) => {
  const [progress, setProgress] = useState(0);
  const elapsed = useRef(0);
  const end = useRef(onEnd);
  end.current = onEnd;
  useEffect(() => {
    elapsed.current = 0;
    setProgress(0);
  }, [key]);
  useEffect(() => {
    if (!running || !ms) {
      return undefined;
    }
    let last = Date.now();
    const timer = globalThis.setInterval(() => {
      const now = Date.now();
      elapsed.current += now - last;
      last = now;
      if (elapsed.current >= ms) {
        globalThis.clearInterval(timer);
        setProgress(1);
        end.current();
      } else {
        setProgress(elapsed.current / ms);
      }
    }, 40);
    return () => globalThis.clearInterval(timer);
  }, [key, ms, running]);
  return [progress, setProgress];
};

const Bars = ({ count, index, progress }) =>
  el(
    'div',
    { className: 'story-bars', 'aria-hidden': 'true' },
    Array.from({ length: count }, (_, i) =>
      el(
        'span',
        { key: i, className: 'story-bar' },
        el('i', {
          style: {
            width: `${Math.round((i < index ? 1 : i === index ? progress : 0) * 100)}%`,
          },
        })
      )
    )
  );

const ago = (t, date) => {
  const { unit, count } = agoParts(Math.floor(Date.now() / 1000), date);
  return t(`chat.stories.ago.${unit}`, { count });
};

const Head = ({ api, t, peer, story, ctl }) =>
  el('div', { className: 'story-head' }, [
    el(PeerAvatar, {
      key: 'a',
      api,
      source: 'telegram',
      peer: peer.peer,
      name: peer.name,
      className: 'avatar story-head-avatar',
    }),
    el('span', { key: 'n', className: 'story-head-name' }, peer.name),
    story?.date
      ? el(
          'span',
          { key: 'd', className: 'story-head-date' },
          ago(t, story.date)
        )
      : null,
    el('span', { key: 's', className: 'story-head-space' }),
    story?.media?.kind === 'video'
      ? el(
          'button',
          {
            key: 'm',
            type: 'button',
            className: 'ghost icon-btn story-btn',
            'data-action': 'story-mute',
            'aria-label': t(
              ctl.muted ? 'chat.stories.unmute' : 'chat.stories.mute'
            ),
            title: t(ctl.muted ? 'chat.stories.unmute' : 'chat.stories.mute'),
            onClick: ctl.toggleMute,
          },
          el(Icon, { name: ctl.muted ? 'mute' : 'volume', size: 18 })
        )
      : null,
    el(
      'button',
      {
        key: 'p',
        type: 'button',
        className: 'ghost icon-btn story-btn',
        'data-action': 'story-pause',
        'aria-label': t(
          ctl.paused ? 'chat.stories.play' : 'chat.stories.pause'
        ),
        title: t(ctl.paused ? 'chat.stories.play' : 'chat.stories.pause'),
        onClick: ctl.togglePause,
      },
      el(Icon, { name: ctl.paused ? 'play' : 'pause', size: 18 })
    ),
    el(
      'button',
      {
        key: 'x',
        type: 'button',
        className: 'ghost icon-btn story-btn',
        'data-action': 'story-close',
        'aria-label': t('chat.stories.close'),
        title: t('chat.stories.close'),
        onClick: ctl.close,
      },
      el(Icon, { name: 'close', size: 18 })
    ),
  ]);

// The picture or the video itself.
const Media = ({ story, url, ctl, setProgress, onEnd, onReady, onFail }) => {
  const video = useRef(null);
  const { paused, muted } = ctl;
  useEffect(() => {
    const node = video.current;
    if (!node) {
      return;
    }
    if (paused) {
      node.pause();
    } else {
      node.play?.()?.catch?.(() => ctl.forceMute());
    }
  }, [paused, url]);
  if (!url) {
    return null;
  }
  if (story.media?.kind === 'video') {
    return el('video', {
      key: url,
      ref: video,
      className: 'story-media',
      ...mediaSrc(url),
      autoPlay: true,
      playsInline: true,
      muted,
      onCanPlay: onReady,
      onError: onFail,
      onEnded: onEnd,
      onTimeUpdate: (e) =>
        e.currentTarget.duration > 0 &&
        setProgress(e.currentTarget.currentTime / e.currentTarget.duration),
    });
  }
  return el('img', {
    key: url,
    className: 'story-media',
    ...mediaSrc(url),
    alt: '',
    draggable: false,
    onLoad: onReady,
    onError: onFail,
  });
};

const Zone = ({ side, label, onClick }) =>
  el('button', {
    type: 'button',
    className: `story-zone is-${side}`,
    'data-action': `story-${side === 'left' ? 'prev' : 'next'}`,
    'aria-label': label,
    tabIndex: -1,
    onClick,
  });

// What stands where a story would: loading, or why there is none.
const stateText = (t, entry, story) => {
  if (!entry || entry.status === 'loading') {
    return t('chat.stories.loading');
  }
  if (entry.status === 'error') {
    const known = ['gone', 'no-access', 'flood'].includes(entry.code);
    return t(`chat.stories.err.${known ? entry.code : 'failed'}`);
  }
  if (story) {
    return story.media?.kind === 'none' ? t('chat.stories.mediaFailed') : null;
  }
  return entry.stories.length > 0
    ? t('chat.stories.loading')
    : t('chat.stories.none');
};

// The story shown, and what moves on: `go('next' | 'previous')`.
const useShown = (api, peers, pos, setPos) => {
  const lists = useStoryLists(api, peers, pos.peerIndex);
  const peer = peers[pos.peerIndex];
  const entry = lists[peer.peer];
  const ready = entry?.status === 'ok';
  useEffect(() => {
    if (!ready || typeof pos.storyIndex === 'number') {
      return;
    }
    const last = Math.max(0, entry.stories.length - 1);
    setPos({
      peerIndex: pos.peerIndex,
      storyIndex:
        pos.storyIndex === 'last'
          ? last
          : startIndex(entry.stories, peer.maxReadId),
    });
  }, [ready, pos.peerIndex, pos.storyIndex]);
  const story = ready ? (entry.stories[pos.storyIndex] ?? null) : null;
  const go = (direction) => {
    if (typeof pos.storyIndex !== 'number') {
      return false;
    }
    const to =
      direction === 'next'
        ? nextPosition(pos, entry?.stories?.length ?? 0, peers.length)
        : previousPosition(pos);
    if (to) {
      setPos(to);
    }
    return Boolean(to);
  };
  return { peer, entry, story, go };
};

// Escape closes; the arrows and the halves of the picture go on and back;
// Space pauses.
const KEY_STEPS = { ArrowRight: 'next', ArrowLeft: 'previous' };

const useViewerKeys = (actions) => {
  const latest = useRef(actions);
  latest.current = actions;
  useEffect(() => {
    const onKey = (e) => {
      const now = latest.current;
      if (e.key === 'Escape') {
        e.stopPropagation();
        now.onClose();
      } else if (KEY_STEPS[e.key]) {
        now.step(KEY_STEPS[e.key]);
      } else if (e.key === ' ') {
        now.togglePause();
      } else {
        return;
      }
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);
};

// How long the clock runs: a picture's time; a video keeps its own.
const pictureMs = (story) =>
  story && story.media?.kind !== 'video' ? showMs(story, photoTime()) : 0;

// The caption, with its formatting.
const Caption = ({ api, story }) =>
  story?.caption
    ? el(
        'div',
        { className: 'story-caption' },
        el(MessageText, { text: story.caption, entities: story.entities, api })
      )
    : null;

export const StoryViewer = ({ api, peers, start, onClose, onRead }) => {
  const t = useT();
  const [pos, setPos] = useState({ peerIndex: start, storyIndex: null });
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const { peer, entry, story, go } = useShown(api, peers, pos, setPos);
  const url = useStoryUrl(api, peer.peer, story);
  const key = story ? `${peer.peer}:${story.id}` : '';
  const step = (direction) => {
    if (!go(direction) && direction === 'next') {
      onClose();
    }
  };
  const [progress, setProgress] = useClock({
    key,
    ms: pictureMs(story),
    running: Boolean(story) && loaded && !paused,
    onEnd: () => step('next'),
  });
  // A story with no picture has nothing to wait for.
  useEffect(() => setLoaded(story?.media?.kind === 'none'), [key]);
  useEffect(() => {
    if (story) {
      onRead(peer.peer, story.id);
    }
  }, [key]);
  const ctl = {
    paused,
    muted,
    togglePause: (e) => {
      e.currentTarget.blur();
      setPaused((p) => !p);
    },
    toggleMute: (e) => {
      e.currentTarget.blur();
      setMuted((m) => !m);
    },
    forceMute: () => setMuted(true),
    close: onClose,
  };
  useViewerKeys({ step, onClose, togglePause: () => setPaused((p) => !p) });
  const text = stateText(t, entry, story);
  return el(
    'div',
    {
      className: 'story-viewer',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': peer.name,
      'data-story-viewer': peer.peer,
      'data-story': story?.id ?? '',
      'data-paused': paused ? 'true' : 'false',
    },
    el('div', { className: 'story-frame' }, [
      el(Bars, {
        key: 'b',
        count: entry?.stories?.length ?? 0,
        index: typeof pos.storyIndex === 'number' ? pos.storyIndex : 0,
        progress,
      }),
      el(Head, { key: 'h', api, t, peer, story, ctl }),
      story
        ? el(Media, {
            key: 'm',
            story,
            url,
            ctl,
            setProgress,
            onEnd: () => step('next'),
            onReady: () => setLoaded(true),
            onFail: () => setLoaded(true),
          })
        : null,
      text
        ? el('p', { key: 'e', className: 'story-text', role: 'status' }, text)
        : null,
      el(Zone, {
        key: 'l',
        side: 'left',
        label: t('chat.stories.prev'),
        onClick: () => step('previous'),
      }),
      el(Zone, {
        key: 'r',
        side: 'right',
        label: t('chat.stories.next'),
        onClick: () => step('next'),
      }),
      el(Caption, { key: 'c', api, story }),
    ])
  );
};
