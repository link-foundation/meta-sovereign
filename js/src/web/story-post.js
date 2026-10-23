// Posting a story, as Telegram Desktop does (R-Y156; learned, never
// copied): "+" on the user's avatar (or "Add story" in the viewer's menu
// on one's own stories) opens a file picker for a photo or video; a
// composer shows it in the 9:16 frame with a caption, whom it is for,
// screenshots, "keep on profile" and (Premium) how long it lasts; posting
// uploads it while the avatar's ring shows the progress. Limits and
// errors are told in words.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from './i18n.js';
import { Icon } from './icons.js';
import { useEsc } from './chat-invite.js';
import { Picker, useContacts } from './chat-create.js';
import {
  DEFAULT_PERIOD,
  PERIOD_CHOICES,
  PRIVACY_CHOICES,
  captionLimit,
  errorKey,
  kindOf,
  limitOf,
  lengthOf,
  postBody,
  problemOf,
} from './story-post-model.js';

const el = React.createElement;

const canAsk = (api) => typeof api?.telegramStoryCanPost === 'function';

// The post itself: upload with progress, then the story. Resolves to
// null on success, else the code.
const postStory = async (api, picked, body, onProgress) => {
  const upload = await api
    .telegramUpload(picked.file, { onProgress })
    .catch(() => null);
  if (!upload?.token) {
    return upload?.code === 'too-large' ? 'media-invalid' : 'failed';
  }
  const answer = await api
    .telegramStoryPost({ ...body, token: upload.token })
    .catch(() => null);
  return answer?.ok ? null : (answer?.code ?? 'failed');
};

/**
 * The state of posting: `info` (what Telegram said of the limit), the
 * file `picked`, the `progress` of a post (0..1, null when none), a
 * `notice` (a code to say in words), and `start()` for the picker.
 * `posted()` is called when a story is up.
 */
export const useStoryPost = (api, enabled, posted) => {
  const [info, setInfo] = useState(null);
  const [picked, setPicked] = useState(null);
  const [progress, setProgress] = useState(null);
  const [notice, setNotice] = useState(null);
  const input = useRef(null);
  const ask = useCallback(async () => {
    const answer = await Promise.resolve(api.telegramStoryCanPost()).catch(
      () => null
    );
    setInfo(answer);
    return answer;
  }, [api]);
  useEffect(() => {
    if (enabled && canAsk(api)) {
      ask();
    }
  }, [api, enabled, ask]);
  const start = () => {
    const code = info && limitOf(info);
    if (code) {
      setNotice(code);
    } else {
      input.current?.click();
    }
  };
  const pick = async (file) => {
    const kind = kindOf(file);
    const code = kind ? limitOf(await ask()) : 'media-invalid';
    if (code) {
      setNotice(code);
      return;
    }
    setPicked({ file, kind, url: URL.createObjectURL(file) });
  };
  const closeComposer = () => {
    setPicked((now) => {
      if (now) {
        URL.revokeObjectURL(now.url);
      }
      return null;
    });
  };
  const submit = async (current, body) => {
    closeComposer();
    setProgress(0);
    const code = await postStory(api, current, body, setProgress);
    setProgress(null);
    if (code) {
      setNotice(code);
    } else {
      posted();
    }
  };
  return {
    available: enabled && canAsk(api),
    info,
    picked,
    progress,
    notice,
    input,
    start,
    pick,
    submit,
    closeComposer,
    dismiss: () => setNotice(null),
  };
};

/** The words for a limit or an error, with an OK. */
const Notice = ({ code, onClose }) => {
  const t = useT();
  useEsc(onClose);
  return el(
    'div',
    {
      className: 'delete-dialog-overlay story-post-overlay',
      role: 'alertdialog',
      'aria-modal': 'true',
      'aria-label': t('chat.storyPost.title'),
      'data-story-notice': code,
    },
    el('div', { className: 'delete-dialog' }, [
      el('p', { key: 'p' }, t(errorKey(code))),
      el(
        'div',
        { key: 'b', className: 'delete-dialog-btns' },
        el(
          'button',
          {
            type: 'button',
            'data-action': 'story-notice-ok',
            onClick: onClose,
          },
          t('chat.storyPost.ok')
        )
      ),
    ])
  );
};

const SelectedContacts = ({ api, users, setUsers }) => {
  const state = useContacts(api);
  const toggle = (id) =>
    setUsers((now) => {
      const next = new Set(now);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  return el(Picker, {
    contacts: state.contacts,
    picked: users,
    toggle,
    t: useT(),
  });
};

// The picture or the video in the frame; a video tells its size and length.
const Preview = ({ picked, onMeta }) =>
  picked.kind === 'video'
    ? el('video', {
        className: 'story-compose-media',
        src: picked.url,
        muted: true,
        loop: true,
        autoPlay: true,
        playsInline: true,
        onLoadedMetadata: (e) =>
          onMeta({
            duration: e.currentTarget.duration,
            width: e.currentTarget.videoWidth,
            height: e.currentTarget.videoHeight,
          }),
      })
    : el('img', { className: 'story-compose-media', src: picked.url, alt: '' });

const Check = ({ name, checked, onChange, label }) =>
  el('label', { className: 'story-compose-check' }, [
    el('input', {
      key: 'i',
      type: 'checkbox',
      'data-field': name,
      checked,
      onChange: (e) => onChange(e.target.checked),
    }),
    el('span', { key: 's' }, label),
  ]);

const Choices = ({ t, name, label, items, value, onPick }) =>
  el('fieldset', { className: 'story-compose-group', 'data-group': name }, [
    el('legend', { key: 'l' }, label),
    ...items.map((item) =>
      el('label', { key: item.key, className: 'story-compose-choice' }, [
        el('input', {
          key: 'i',
          type: 'radio',
          name,
          value: item.key,
          'data-choice': item.key,
          checked: value === item.key,
          onChange: () => onPick(item.key),
        }),
        el('span', { key: 's' }, item.text ?? t(item.label)),
      ])
    ),
  ]);

const useOptions = () => {
  const [options, setOptions] = useState({
    caption: '',
    privacy: 'everyone',
    users: new Set(),
    screenshots: true,
    pinned: false,
    period: DEFAULT_PERIOD,
  });
  const set = (field) => (value) =>
    setOptions((now) => ({
      ...now,
      [field]: typeof value === 'function' ? value(now[field]) : value,
    }));
  return { options, set };
};

const Panel = ({ api, t, post, options, set, problem, onPost }) => {
  const { info } = post;
  return el('div', { className: 'story-compose-panel' }, [
    el(Choices, {
      key: 'w',
      t,
      name: 'privacy',
      label: t('chat.storyPost.who'),
      items: PRIVACY_CHOICES,
      value: options.privacy,
      onPick: set('privacy'),
    }),
    options.privacy === 'selected'
      ? el(SelectedContacts, {
          key: 'c',
          api,
          users: options.users,
          setUsers: set('users'),
        })
      : null,
    el(Check, {
      key: 's',
      name: 'screenshots',
      checked: options.screenshots,
      onChange: set('screenshots'),
      label: t('chat.storyPost.screenshots'),
    }),
    el(Check, {
      key: 'p',
      name: 'pinned',
      checked: options.pinned,
      onChange: set('pinned'),
      label: t('chat.storyPost.pin'),
    }),
    info?.premium
      ? el(Choices, {
          key: 'd',
          t,
          name: 'period',
          label: t('chat.storyPost.period'),
          items: PERIOD_CHOICES.map((p) => ({
            key: String(p.seconds),
            text: t('chat.storyPost.hours', { count: p.hours }),
          })),
          value: String(options.period),
          onPick: (key) => set('period')(Number(key)),
        })
      : null,
    problem ? el('p', { key: 'e', role: 'alert' }, t(errorKey(problem))) : null,
    el('div', { key: 'b', className: 'story-compose-btns' }, [
      el(
        'button',
        {
          key: 'c',
          type: 'button',
          className: 'ghost',
          'data-action': 'story-compose-cancel',
          onClick: post.closeComposer,
        },
        t('chat.storyPost.cancel')
      ),
      el(
        'button',
        {
          key: 'p',
          type: 'button',
          'data-action': 'story-compose-post',
          disabled: Boolean(problem),
          onClick: onPost,
        },
        t('chat.storyPost.post')
      ),
    ]),
  ]);
};

/** The composer: the media in a 9:16 frame, a caption, and the options. */
const Composer = ({ api, post }) => {
  const t = useT();
  useEsc(post.closeComposer);
  const { picked, info } = post;
  const { options, set } = useOptions();
  const [meta, setMeta] = useState(null);
  const waiting = picked.kind === 'video' && !meta;
  const problem = problemOf({
    kind: picked.kind,
    duration: meta?.duration,
    privacy: options.privacy,
    users: [...options.users],
    caption: options.caption,
    info,
  });
  const limit = captionLimit(info);
  const onPost = () =>
    post.submit(
      picked,
      postBody({ token: '', kind: picked.kind, options, meta, info })
    );
  return el(
    'div',
    {
      className: 'story-compose',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': t('chat.storyPost.title'),
      'data-story-composer': picked.kind,
    },
    el('div', { className: 'story-compose-body' }, [
      el('div', { key: 'f', className: 'story-compose-frame' }, [
        el(Preview, { key: 'm', picked, onMeta: setMeta }),
        el('textarea', {
          key: 'c',
          className: 'story-compose-caption',
          'data-field': 'caption',
          rows: 2,
          placeholder: t('chat.storyPost.caption'),
          'aria-label': t('chat.storyPost.caption'),
          value: options.caption,
          onChange: (e) => set('caption')(e.target.value),
        }),
        el(
          'span',
          { key: 'n', className: 'story-compose-count' },
          `${lengthOf(options.caption)}/${limit}`
        ),
      ]),
      el(Panel, {
        key: 'p',
        api,
        t,
        post,
        options,
        set,
        problem,
        onPost: waiting ? () => {} : onPost,
      }),
    ])
  );
};

/** The picker, the composer and the notice; rendered once, above the page. */
export const StoryPostHost = ({ api, post }) => {
  if (!post.available) {
    return null;
  }
  return createPortal(
    el(React.Fragment, null, [
      el('input', {
        key: 'i',
        ref: post.input,
        type: 'file',
        accept: 'image/*,video/*',
        hidden: true,
        'data-story-file': 'true',
        onChange: (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) {
            post.pick(file);
          }
        },
      }),
      post.picked ? el(Composer, { key: 'c', api, post }) : null,
      post.notice
        ? el(Notice, { key: 'n', code: post.notice, onClose: post.dismiss })
        : null,
    ]),
    globalThis.document.body
  );
};

/** The "+" badge on the user's own avatar. */
export const AddBadge = () =>
  el(
    'span',
    { className: 'story-add-badge', 'aria-hidden': 'true' },
    el(Icon, { name: 'plus', size: 12 })
  );
