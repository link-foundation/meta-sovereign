// What the story viewer offers besides watching (R-Y148; learned, never
// copied): a private reply, a heart and a small picker of reactions,
// for someone else's story; the views, the viewers with their reactions
// and "Delete" (asked first), for one's own; "Hide stories" / "Unhide"
// in the viewer's menu. The viewer pauses while any of these is in use.

import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';
import { PeerAvatar } from './peer-avatar.js';
import {
  LIKE,
  STORY_REACTIONS,
  joinViews,
  reactionAfter,
  viewersBody,
} from './stories-model.js';
import { ViewersFilters, ViewersTabs } from './story-extras.js';

const el = React.createElement;

// The text of a failed action.
const failText = (t, answer) => {
  const known = ['gone', 'no-access', 'flood', 'too-long', 'bad-reaction'];
  const code = known.includes(answer?.code) ? answer.code : 'failed';
  return t(`chat.stories.err.${code}`);
};

/** "Reply privately…": the box at the bottom of someone else's story. */
export const ReplyBox = ({ api, peer, story, onFocus }) => {
  const t = useT();
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const key = `${peer.peer}:${story.id}`;
  useEffect(() => {
    setText('');
    setNote('');
  }, [key]);
  const send = async (event) => {
    event.preventDefault();
    const body = text.trim();
    if (!body || busy) {
      return;
    }
    setBusy(true);
    const answer = await Promise.resolve(
      api?.telegramStoryReply?.({ chat: peer.peer, id: story.id, text: body })
    ).catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      setText('');
      setNote(t('chat.stories.replySent'));
      event.target.querySelector?.('input')?.blur();
    } else {
      setNote(failText(t, answer));
    }
  };
  return el('form', { className: 'story-reply', onSubmit: send }, [
    el('input', {
      key: 'i',
      type: 'text',
      className: 'story-reply-input',
      'data-story-reply': 'input',
      placeholder: t('chat.stories.reply'),
      'aria-label': t('chat.stories.reply'),
      maxLength: 4096,
      value: text,
      onChange: (e) => setText(e.target.value),
      onFocus: () => onFocus(true),
      onBlur: () => onFocus(false),
    }),
    el(
      'button',
      {
        key: 's',
        type: 'submit',
        className: 'ghost icon-btn story-btn',
        'data-action': 'story-reply-send',
        'aria-label': t('chat.stories.replySend'),
        title: t('chat.stories.replySend'),
        disabled: busy || !text.trim(),
      },
      el(Icon, { name: 'send', size: 18 })
    ),
    note
      ? el('span', { key: 'n', className: 'story-note', role: 'status' }, note)
      : null,
  ]);
};

const Picker = ({ t, current, onPick }) =>
  el(
    'div',
    { className: 'story-picker', role: 'menu', 'data-story-picker': 'open' },
    STORY_REACTIONS.map((emoji) =>
      el(
        'button',
        {
          key: emoji,
          type: 'button',
          role: 'menuitem',
          className: `story-picker-item${current === emoji ? ' is-on' : ''}`,
          'data-reaction': emoji,
          'aria-label': emoji,
          title: current === emoji ? t('chat.stories.unreact') : emoji,
          onClick: () => onPick(emoji),
        },
        emoji
      )
    )
  );

/** The heart (a quick like, a second press takes it back) and the picker. */
export const ReactionButtons = ({
  api,
  peer,
  story,
  current,
  onReacted,
  picker,
  onPicker,
}) => {
  const t = useT();
  const [note, setNote] = useState('');
  const send = async (reaction) => {
    const answer = await Promise.resolve(
      api?.telegramStoryReact?.({ chat: peer.peer, id: story.id, reaction })
    ).catch(() => null);
    if (answer?.ok) {
      setNote('');
      onReacted(reaction);
    } else {
      setNote(failText(t, answer));
    }
  };
  const heart = current
    ? current === LIKE
      ? el(Icon, { name: 'heart', size: 20 })
      : el('span', { className: 'story-react-emoji' }, current)
    : el(Icon, { name: 'heart', size: 20 });
  return el('div', { className: 'story-react' }, [
    el(
      'button',
      {
        key: 'h',
        type: 'button',
        className: `ghost icon-btn story-btn story-heart${current ? ' is-on' : ''}`,
        'data-action': 'story-react',
        'data-reaction-now': current,
        'aria-pressed': current ? 'true' : 'false',
        'aria-label': t(current ? 'chat.stories.unreact' : 'chat.stories.like'),
        title: t(current ? 'chat.stories.unreact' : 'chat.stories.like'),
        onClick: () => send(current ? '' : LIKE),
      },
      heart
    ),
    el(
      'button',
      {
        key: 'm',
        type: 'button',
        className: 'ghost icon-btn story-btn',
        'data-action': 'story-react-more',
        'aria-expanded': picker ? 'true' : 'false',
        'aria-label': t('chat.stories.reactions'),
        title: t('chat.stories.reactions'),
        onClick: () => onPicker(!picker),
      },
      el(Icon, { name: 'smile', size: 18 })
    ),
    picker
      ? el(Picker, {
          key: 'p',
          t,
          current,
          onPick: (emoji) => {
            onPicker(false);
            send(reactionAfter(current, emoji));
          },
        })
      : null,
    note ? el('span', { key: 'n', className: 'story-note' }, note) : null,
  ]);
};

// Viewers, a page after another. The tab ("viewers" or "reactions",
// R-Y199), the search and the switches decide what is asked; a change
// starts the list again, and an answer to an older question is dropped.
const useViewers = (api, peer, story, filter) => {
  const [state, setState] = useState({
    status: 'loading',
    views: [],
    next: '',
  });
  const latest = useRef(0);
  const load = async (offset) => {
    const turn = (latest.current += 1);
    const want = { chat: peer.peer, id: story.id, ...filter };
    const body = viewersBody(want, offset);
    const ask =
      filter.tab === 'reactions'
        ? api?.telegramStoryReactions
        : api?.telegramStoryViews;
    const answer = await Promise.resolve(ask?.(body)).catch(() => null);
    if (turn !== latest.current) {
      return;
    }
    setState((held) =>
      answer?.ok
        ? {
            status: 'ok',
            views: joinViews(offset ? held.views : [], answer.views ?? []),
            next: answer.next ?? '',
            count: answer.viewsCount,
          }
        : { ...held, status: 'error', code: answer?.code }
    );
  };
  useEffect(() => {
    setState((held) => ({ ...held, status: 'loading' }));
    load('');
  }, [
    peer.peer,
    story.id,
    filter.tab,
    filter.q,
    filter.contacts,
    filter.reactionsFirst,
  ]);
  return { ...state, more: () => load(state.next) };
};

const when = (date) =>
  date ? new Date(date * 1000).toLocaleString([], { hour12: false }) : '';

// One row: the person (or chat), when, a reaction, or that it was a
// forward or a repost of the story (R-Y199).
const ViewerRow = ({ api, t, view }) =>
  el(
    'li',
    {
      'data-viewer': view.user,
      'data-viewer-kind': view.kind ?? 'view',
    },
    [
      el(PeerAvatar, {
        key: 'a',
        api,
        source: 'telegram',
        peer: view.user,
        name: view.name,
        className: 'avatar story-viewer-avatar',
      }),
      el('span', { key: 'n', className: 'story-viewer-name' }, view.name),
      view.kind === 'forward' || view.kind === 'repost'
        ? el(
            'span',
            { key: 'k', className: 'story-viewer-kind' },
            t(`chat.stories.kind.${view.kind}`)
          )
        : null,
      el('span', { key: 'd', className: 'story-viewer-date' }, when(view.date)),
      view.reaction
        ? el(
            'span',
            { key: 'r', className: 'story-viewer-reaction' },
            view.reaction
          )
        : null,
    ]
  );

const ViewersHead = ({ t, onClose }) =>
  el('div', { className: 'story-viewers-head' }, [
    el('strong', { key: 't' }, t('chat.stories.viewers')),
    el(
      'button',
      {
        key: 'x',
        type: 'button',
        className: 'ghost icon-btn story-btn',
        'data-action': 'story-viewers-close',
        'aria-label': t('chat.stories.close'),
        onClick: onClose,
      },
      el(Icon, { name: 'close', size: 18 })
    ),
  ]);

// The note under the list: loading, none, or failed.
const ViewersNote = ({ t, status, empty, reactions }) => {
  const text =
    status === 'loading'
      ? 'chat.stories.loading'
      : status === 'error'
        ? 'chat.stories.err.failed'
        : empty
          ? reactions
            ? 'chat.stories.noReactions'
            : 'chat.stories.noViewers'
          : '';
  return text ? el('p', { className: 'story-note' }, t(text)) : null;
};

const INITIAL_FILTER = {
  tab: 'viewers',
  q: '',
  contacts: false,
  reactionsFirst: false,
};

/**
 * The viewers of one's own story with their reactions; "load more", the
 * "Reactions" tab (with forwards and reposts as entries), a search box and
 * "Contacts only" / "Reactions first" (R-Y199).
 */
export const ViewersPanel = ({ api, peer, story, onClose }) => {
  const t = useT();
  const [filter, setFilter] = useState(INITIAL_FILTER);
  const change = (patch) =>
    setFilter((held) =>
      Object.entries(patch).every(([k, v]) => held[k] === v)
        ? held
        : { ...held, ...patch }
    );
  const { status, views, next, more } = useViewers(api, peer, story, filter);
  const reactions = filter.tab === 'reactions';
  return el(
    'div',
    {
      className: 'story-viewers',
      role: 'dialog',
      'aria-label': t('chat.stories.viewers'),
      'data-story-viewers': status,
    },
    [
      el(ViewersHead, { key: 'h', t, onClose }),
      el(ViewersTabs, {
        key: 'tabs',
        tab: filter.tab,
        onTab: (tab) => change({ tab }),
      }),
      reactions
        ? null
        : el(ViewersFilters, { key: 'f', filter, onChange: change }),
      el(
        'ul',
        { key: 'l', className: 'story-viewers-list' },
        views.map((view, i) =>
          el(ViewerRow, { key: `${view.kind}:${view.user}:${i}`, api, t, view })
        )
      ),
      el(ViewersNote, {
        key: 'o',
        t,
        status,
        reactions,
        empty: status === 'ok' && views.length === 0,
      }),
      next
        ? el(
            'button',
            {
              key: 'm',
              type: 'button',
              className: 'ghost story-more',
              'data-action': 'story-viewers-more',
              onClick: more,
            },
            t('chat.stories.loadMore')
          )
        : null,
    ]
  );
};

/** Delete one's own story: asked first. */
export const ConfirmDelete = ({ onYes, onNo }) => {
  const t = useT();
  return el(
    'div',
    {
      className: 'story-confirm',
      role: 'alertdialog',
      'aria-label': t('chat.stories.deleteTitle'),
      'data-story-confirm': 'delete',
    },
    [
      el('p', { key: 'p' }, t('chat.stories.deleteAsk')),
      el('div', { key: 'b', className: 'story-confirm-buttons' }, [
        el(
          'button',
          {
            key: 'n',
            type: 'button',
            className: 'ghost',
            'data-action': 'story-delete-no',
            onClick: onNo,
          },
          t('chat.stories.cancel')
        ),
        el(
          'button',
          {
            key: 'y',
            type: 'button',
            className: 'danger',
            'data-action': 'story-delete-yes',
            onClick: onYes,
          },
          t('chat.stories.delete')
        ),
      ]),
    ]
  );
};

/** The footer of one's own story: views, reactions, delete. */
export const OwnFoot = ({ story, onViewers, onDelete }) => {
  const t = useT();
  return el('div', { className: 'story-own' }, [
    el(
      'button',
      {
        key: 'v',
        type: 'button',
        className: 'ghost story-views',
        'data-action': 'story-views',
        onClick: onViewers,
      },
      t('chat.stories.views', { count: story.views ?? 0 })
    ),
    story.reactions
      ? el(
          'span',
          { key: 'r', className: 'story-views-reactions' },
          `❤ ${story.reactions}`
        )
      : null,
    el('span', { key: 's', className: 'story-head-space' }),
    el(
      'button',
      {
        key: 'd',
        type: 'button',
        className: 'ghost icon-btn story-btn',
        'data-action': 'story-delete',
        'aria-label': t('chat.stories.delete'),
        title: t('chat.stories.delete'),
        onClick: onDelete,
      },
      el(Icon, { name: 'trash', size: 18 })
    ),
  ]);
};

/** The viewer's menu: hide this person's stories, or show them again. */
export const StoryMenu = ({
  hidden,
  onToggle,
  own = false,
  onAdd,
  onStealth,
  onReport,
  entries = [],
}) => {
  const t = useT();
  // One's own stories: "Add story" (R-Y156); others': "Stealth mode" and
  // "Report" (R-Y199), hide or unhide.
  const item = (action, label, onClick) =>
    el(
      'button',
      {
        key: action,
        type: 'button',
        role: 'menuitem',
        className: 'ghost',
        'data-action': action,
        onClick,
      },
      label
    );
  const manage = entries.map((e) => item(e.action, e.label, e.onClick));
  const items = own
    ? [
        onAdd ? item('story-add', t('chat.storyPost.addMenu'), onAdd) : null,
        ...manage,
      ]
    : [
        ...manage,
        onStealth
          ? item('story-stealth', t('chat.stories.stealth.title'), onStealth)
          : null,
        onReport
          ? item('story-report', t('chat.stories.report'), onReport)
          : null,
        item(
          'story-hide',
          t(hidden ? 'chat.stories.unhide' : 'chat.stories.hide'),
          onToggle
        ),
      ];
  return el('div', { className: 'story-menu', role: 'menu' }, items);
};
