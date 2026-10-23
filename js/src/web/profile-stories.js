// Stories on a profile, as Telegram Desktop shows them (R-Y185; learned,
// never copied). A person's or channel's info column has "Stories": their
// pinned stories as a grid (the ones fixed on top first), grouped by album
// chips when they have albums; a click opens the story viewer on them. On
// one's own profile there is also "Archive" (the expired stories, a grid in
// a dialog) and each story can be shown on or taken off the profile, or
// fixed on top (at most 3). Those are the only writes, each on a click.

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from './i18n.js';
import { Frame } from './chat-readers.js';
import { mediaSrc } from './media-src.js';
import { StoryViewer } from './story-viewer.js';
import { clockOf } from './chat-media.js';
import { storiesInOrder, topIds } from './profile-stories-model.js';

const el = React.createElement;

const errorText = (t, code) => {
  const key = `chat.profileStories.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.profileStories.err.failed') : text;
};

/** Whether a chat's info column may show stories: a person or a channel. */
export const hasProfileStories = (chat, api) =>
  chat?.source === 'telegram' &&
  /^(\d+|-100\d+)$/.test(String(chat.chat)) &&
  typeof api?.telegramProfileStories === 'function';

// A list read a page at a time: `load(offset)` answers `{ ok, stories,
// next, … }`; the list starts again when `key` changes.
const usePages = (load, key) => {
  const [state, setState] = useState({
    rows: [],
    next: null,
    busy: true,
    code: null,
    first: null,
  });
  const latest = useRef(0);
  const run = (offset) => {
    const mine = ++latest.current;
    setState((s) => ({ ...s, busy: true, code: null }));
    return Promise.resolve(load(offset))
      .catch(() => null)
      .then((answer) => {
        if (mine !== latest.current) {
          return;
        }
        setState((s) =>
          answer?.ok
            ? {
                rows: offset ? [...s.rows, ...answer.stories] : answer.stories,
                next: answer.next ?? null,
                busy: false,
                code: null,
                first: offset ? s.first : answer,
              }
            : { ...s, busy: false, code: answer?.code ?? 'failed' }
        );
      });
  };
  useEffect(() => {
    setState({ rows: [], next: null, busy: true, code: null, first: null });
    run(0);
  }, [key]);
  return [state, run, setState];
};

// A story's picture; a video shows a play mark and its length.
const useThumb = (api, chat, story) => {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (story.media?.kind !== 'photo') {
      return undefined;
    }
    let live = true;
    api
      ?.telegramStoryUrl?.({ peer: chat, id: story.id })
      .then((next) => live && setUrl(next ?? null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [api, chat, story.id]);
  return url;
};

const Thumb = ({ api, chat, story }) => {
  const url = useThumb(api, chat, story);
  if (story.media?.kind === 'video') {
    return el('span', { className: 'story-cell-video' }, [
      el('span', { key: 'p' }, '▶'),
      story.media.duration
        ? el(
            'span',
            { key: 'd', className: 'meta' },
            clockOf(story.media.duration)
          )
        : null,
    ]);
  }
  return url
    ? el('img', {
        ...mediaSrc(url),
        alt: '',
        draggable: false,
        loading: 'lazy',
      })
    : el('span', { className: 'story-cell-video' }, '🖼');
};

const Cell = ({ api, chat, story, onOpen, actions }) => {
  const t = useT();
  return el(
    'div',
    {
      className: `story-cell${story.top ? ' is-top' : ''}`,
      'data-story-cell': story.id,
    },
    [
      el(
        'button',
        {
          key: 'o',
          type: 'button',
          className: 'story-cell-open',
          'data-action': 'profile-story-open',
          'aria-label': t('chat.profileStories.open'),
          onClick: onOpen,
        },
        el(Thumb, { api, chat, story })
      ),
      story.top
        ? el(
            'span',
            { key: 't', className: 'story-cell-mark', 'data-story-top': '' },
            '📌'
          )
        : null,
      actions
        ? el('div', { key: 'a', className: 'story-cell-actions' }, actions)
        : null,
    ]
  );
};

const ActionButton = ({ action, label, busy, onClick }) =>
  el(
    'button',
    {
      type: 'button',
      className: 'ghost',
      'data-action': action,
      disabled: busy,
      onClick,
    },
    label
  );

// The viewer over the page: the stories of the list as one peer's.
const Viewer = ({ api, peer, start, onClose }) =>
  createPortal(
    el(StoryViewer, {
      api,
      peers: [peer],
      start: 0,
      startStory: start,
      onRead: () => {},
      onHide: () => {},
      onClose,
    }),
    globalThis.document.body
  );

const Grid = ({ api, chat, rows, onOpen, actionsOf }) =>
  el(
    'div',
    { className: 'story-grid', 'data-story-grid': rows.length },
    rows.map((story, index) =>
      el(Cell, {
        key: story.id,
        api,
        chat,
        story,
        onOpen: () => onOpen(index),
        actions: actionsOf?.(story),
      })
    )
  );

const More = ({ t, state, run }) =>
  state.next && !state.busy
    ? el(
        'button',
        {
          type: 'button',
          'data-action': 'profile-stories-more',
          onClick: () => run(state.next),
        },
        t('chat.profileStories.more')
      )
    : null;

const Failure = ({ t, code }) =>
  code
    ? el(
        'p',
        { className: 'comments-failed', role: 'alert' },
        errorText(t, code)
      )
    : null;

// The writes, run on a click: `ask()` answers `{ ok, … }`.
const useWrite = (setCode) => {
  const [busy, setBusy] = useState(false);
  const go = async (ask, done) => {
    setBusy(true);
    setCode(null);
    const answer = await Promise.resolve(ask()).catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      done(answer);
    } else {
      setCode(answer?.code ?? 'failed');
    }
  };
  return [busy, go];
};

const Albums = ({ t, albums, album, onPick }) =>
  albums.length > 0
    ? el('div', { className: 'story-albums', role: 'tablist' }, [
        el(
          'button',
          {
            key: 'all',
            type: 'button',
            role: 'tab',
            'aria-selected': album === 0,
            className: album === 0 ? 'active' : '',
            'data-album': 'all',
            onClick: () => onPick(0),
          },
          t('chat.profileStories.all')
        ),
        ...albums.map((a) =>
          el(
            'button',
            {
              key: a.id,
              type: 'button',
              role: 'tab',
              'aria-selected': album === a.id,
              className: album === a.id ? 'active' : '',
              'data-album': a.id,
              onClick: () => onPick(a.id),
            },
            a.title
          )
        ),
      ])
    : null;

// The archive: expired stories, each can be shown on the profile.
const Archive = ({ api, chat, name, onClose, onPinned }) => {
  const t = useT();
  const [state, run, setState] = usePages(
    (offset) => api.telegramStoriesArchive({ offset }),
    'archive'
  );
  const [code, setCode] = useState(null);
  const [busy, write] = useWrite(setCode);
  const [open, setOpen] = useState(null);
  const me = state.first?.me || chat;
  const pin = (story) =>
    write(
      () =>
        api.telegramStoryPin({
          chat: me,
          ids: [story.id],
          pinned: !story.pinned,
        }),
      (answer) => {
        setState((s) => ({
          ...s,
          rows: s.rows.map((r) =>
            r.id === story.id ? { ...r, pinned: answer.pinned } : r
          ),
        }));
        onPinned();
      }
    );
  return el(
    Frame,
    {
      title: t('chat.profileStories.archiveTitle'),
      close: onClose,
      name: 'stories-archive',
    },
    el('div', { className: 'admin-body' }, [
      state.rows.length === 0 && !state.busy && !state.code
        ? el(
            'p',
            { key: 'e', className: 'meta' },
            t('chat.profileStories.emptyArchive')
          )
        : null,
      el(Grid, {
        key: 'g',
        api,
        chat: me,
        rows: state.rows,
        onOpen: setOpen,
        actionsOf: (story) =>
          el(ActionButton, {
            action: 'story-pin',
            busy,
            label: t(
              story.pinned
                ? 'chat.profileStories.remove'
                : 'chat.profileStories.add'
            ),
            onClick: () => pin(story),
          }),
      }),
      el(Failure, { key: 'f', t, code: code ?? state.code }),
      el(More, { key: 'm', t, state, run }),
      open === null
        ? null
        : el(Viewer, {
            key: 'v',
            api,
            peer: { peer: me, name, self: true, stories: state.rows },
            start: open,
            onClose: () => setOpen(null),
          }),
    ])
  );
};

const Section = ({ api, chat, name }) => {
  const t = useT();
  const [album, setAlbum] = useState(0);
  const [state, run, setState] = usePages(
    (offset) =>
      api.telegramProfileStories({
        chat,
        ...(album ? { album } : {}),
        ...(offset ? { offset } : {}),
      }),
    `${chat}:${album}`
  );
  const [albums, setAlbums] = useState([]);
  const [code, setCode] = useState(null);
  const [busy, write] = useWrite(setCode);
  const [open, setOpen] = useState(null);
  const [archive, setArchive] = useState(false);
  const [change, setChange] = useState(0);
  const mine = Boolean(state.first?.mine);
  useEffect(() => {
    if (!album && state.first) {
      setAlbums(state.first.albums ?? []);
    }
  }, [state.first]);
  useEffect(() => {
    setAlbum(0);
    setAlbums([]);
  }, [chat]);
  useEffect(() => {
    if (change > 0) {
      run(0);
    }
  }, [change]);
  const rows = storiesInOrder(state.rows);
  const unpin = (story) =>
    write(
      () => api.telegramStoryPin({ chat, ids: [story.id], pinned: false }),
      () =>
        setState((s) => ({
          ...s,
          rows: s.rows.filter((r) => r.id !== story.id),
        }))
    );
  const top = (story) => {
    const now = topIds(state.rows);
    const next = story.top
      ? now.filter((id) => id !== story.id)
      : [...now, story.id];
    return write(
      () =>
        next.length > 3
          ? { ok: false, code: 'too-many' }
          : api.telegramStoryPinTop({ chat, ids: next }),
      () =>
        setState((s) => ({
          ...s,
          rows: s.rows.map((r) => ({ ...r, top: next.includes(r.id) })),
        }))
    );
  };
  if (state.rows.length === 0 && !mine && !state.code && !album) {
    return null;
  }
  return el(
    'section',
    { className: 'person-section', 'data-profile-stories': rows.length },
    [
      el('h3', { key: 'h' }, t('chat.profileStories.title')),
      el(Albums, { key: 'al', t, albums, album, onPick: setAlbum }),
      el(Grid, {
        key: 'g',
        api,
        chat,
        rows,
        onOpen: setOpen,
        actionsOf: mine
          ? (story) => [
              el(ActionButton, {
                key: 'u',
                action: 'story-unpin',
                busy,
                label: t('chat.profileStories.remove'),
                onClick: () => unpin(story),
              }),
              el(ActionButton, {
                key: 't',
                action: 'story-top',
                busy,
                label: t(
                  story.top
                    ? 'chat.profileStories.untop'
                    : 'chat.profileStories.top'
                ),
                onClick: () => top(story),
              }),
            ]
          : null,
      }),
      el(Failure, { key: 'f', t, code: code ?? state.code }),
      el(More, { key: 'm', t, state, run }),
      mine && typeof api.telegramStoriesArchive === 'function'
        ? el(
            'button',
            {
              key: 'ar',
              type: 'button',
              'data-action': 'stories-archive',
              onClick: () => setArchive(true),
            },
            t('chat.profileStories.archive')
          )
        : null,
      open === null
        ? null
        : el(Viewer, {
            key: 'v',
            api,
            peer: {
              peer: chat,
              name,
              self: mine,
              stories: rows,
            },
            start: open,
            onClose: () => setOpen(null),
          }),
      archive
        ? el(Archive, {
            key: 'a',
            api,
            chat,
            name,
            onClose: () => setArchive(false),
            onPinned: () => setChange((n) => n + 1),
          })
        : null,
    ]
  );
};

/** The person's or channel's pinned stories in the info column. */
export const ProfileStoriesRow = ({ api, chat }) =>
  hasProfileStories(chat, api)
    ? el(Section, {
        api,
        chat: String(chat.chat),
        name: String(chat.name ?? ''),
      })
    : null;
