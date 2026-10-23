// What the story viewer offers besides watching (R-Y148; learned, never
// copied): a private reply, a heart and a small picker of reactions,
// for someone else's story; the views, the viewers with their reactions
// and "Delete" (asked first), for one's own; "Hide stories" / "Unhide"
// in the viewer's menu. The viewer pauses while any of these is in use.

import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';
import { PeerAvatar } from './peer-avatar.js';
import {
  LIKE,
  STORY_REACTIONS,
  joinViews,
  reactionAfter,
} from './stories-model.js';

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

// Viewers, a page after another.
const useViewers = (api, peer, story) => {
  const [state, setState] = useState({
    status: 'loading',
    views: [],
    next: '',
  });
  const load = async (offset) => {
    const answer = await Promise.resolve(
      api?.telegramStoryViews?.({
        chat: peer.peer,
        id: story.id,
        ...(offset ? { offset } : {}),
      })
    ).catch(() => null);
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
    load('');
  }, [peer.peer, story.id]);
  return { ...state, more: () => load(state.next) };
};

const when = (date) =>
  date ? new Date(date * 1000).toLocaleString([], { hour12: false }) : '';

/** The viewers of one's own story with their reactions; "load more". */
export const ViewersPanel = ({ api, peer, story, onClose }) => {
  const t = useT();
  const { status, views, next, more } = useViewers(api, peer, story);
  return el(
    'div',
    {
      className: 'story-viewers',
      role: 'dialog',
      'aria-label': t('chat.stories.viewers'),
      'data-story-viewers': status,
    },
    [
      el('div', { key: 'h', className: 'story-viewers-head' }, [
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
      ]),
      el(
        'ul',
        { key: 'l', className: 'story-viewers-list' },
        views.map((view) =>
          el('li', { key: view.user, 'data-viewer': view.user }, [
            el(PeerAvatar, {
              key: 'a',
              api,
              source: 'telegram',
              peer: view.user,
              name: view.name,
              className: 'avatar story-viewer-avatar',
            }),
            el('span', { key: 'n', className: 'story-viewer-name' }, view.name),
            el(
              'span',
              { key: 'd', className: 'story-viewer-date' },
              when(view.date)
            ),
            view.reaction
              ? el(
                  'span',
                  { key: 'r', className: 'story-viewer-reaction' },
                  view.reaction
                )
              : null,
          ])
        )
      ),
      status === 'loading'
        ? el(
            'p',
            { key: 'o', className: 'story-note' },
            t('chat.stories.loading')
          )
        : null,
      status === 'ok' && views.length === 0
        ? el(
            'p',
            { key: 'e', className: 'story-note' },
            t('chat.stories.noViewers')
          )
        : null,
      status === 'error'
        ? el(
            'p',
            { key: 'f', className: 'story-note' },
            t('chat.stories.err.failed')
          )
        : null,
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
export const StoryMenu = ({ hidden, onToggle, own = false, onAdd }) => {
  const t = useT();
  // One's own stories: "Add story" (R-Y156); others': hide or unhide.
  return el(
    'div',
    { className: 'story-menu', role: 'menu' },
    own
      ? el(
          'button',
          {
            type: 'button',
            role: 'menuitem',
            className: 'ghost',
            'data-action': 'story-add',
            onClick: onAdd,
          },
          t('chat.storyPost.addMenu')
        )
      : el(
          'button',
          {
            type: 'button',
            role: 'menuitem',
            className: 'ghost',
            'data-action': 'story-hide',
            onClick: onToggle,
          },
          t(hidden ? 'chat.stories.unhide' : 'chat.stories.hide')
        )
  );
};
