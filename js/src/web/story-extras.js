// The remaining story features of Telegram Desktop (R-Y199; learned,
// never copied): "Stealth mode" (a dialog that explains it and enables
// it, the time left shown while it is on and the wait while it cools
// down, a small badge over the story), the viewers' search and switches,
// reporting someone else's story through the same dialog as a chat's, and
// the fresh view counters of one's own story.

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from './i18n.js';
import { Icon } from './icons.js';
import { ReportDialog } from './chat-peer-actions.js';
import { clockText, stealthAfter, stealthStatus } from './stories-model.js';

const el = React.createElement;

const nowSec = () => Math.floor(Date.now() / 1000);

// The time in seconds, again every second while `on`.
const useNow = (on) => {
  const [now, setNow] = useState(nowSec);
  useEffect(() => {
    setNow(nowSec());
    if (!on) {
      return undefined;
    }
    const timer = globalThis.setInterval(() => setNow(nowSec()), 1000);
    return () => globalThis.clearInterval(timer);
  }, [on]);
  return now;
};

/** The small badge over the story while stealth mode is on. */
export const StealthBadge = ({ stealth }) => {
  const t = useT();
  const now = useNow(Boolean(stealth?.activeUntil));
  const { phase, left } = stealthStatus(stealth, now);
  return phase === 'active'
    ? el(
        'span',
        {
          className: 'story-stealth-badge',
          'data-stealth-badge': 'on',
          title: t('chat.stories.stealth.on'),
        },
        [el(Icon, { key: 'i', name: 'eye', size: 14 }), ` ${clockText(left)}`]
      )
    : null;
};

// The words of a failed activation.
const stealthError = (t, code) => {
  const known = ['premium', 'cooldown', 'flood'].includes(code);
  return t(`chat.stories.stealth.err.${known ? code : 'failed'}`);
};

const StealthStatus = ({ t, status }) => {
  if (status.phase === 'active') {
    return el('p', { className: 'story-stealth-state', 'data-stealth': 'on' }, [
      t('chat.stories.stealth.on'),
      ' ',
      el(
        'b',
        { key: 'b', 'data-stealth-left': status.left },
        clockText(status.left)
      ),
    ]);
  }
  return status.phase === 'cooldown'
    ? el(
        'p',
        { className: 'story-stealth-state', 'data-stealth': 'cooldown' },
        [
          t('chat.stories.stealth.cooldown'),
          ' ',
          el('b', { key: 'b' }, clockText(status.wait)),
        ]
      )
    : null;
};

/** "Stealth mode": what it hides, the button, the time left or the wait. */
export const StealthDialog = ({ api, stealth, onStealth, onClose }) => {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const now = useNow(true);
  const status = stealthStatus(stealth, now);
  const enable = async () => {
    setBusy(true);
    const answer = await Promise.resolve(
      api?.telegramStoryStealth?.({ past: true, future: true })
    ).catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      setCode('');
      onStealth(stealthAfter(answer, nowSec()));
    } else {
      setCode(answer?.code ?? 'failed');
    }
  };
  return createPortal(
    el(
      'div',
      { className: 'story-dialog-host' },
      el(
        'div',
        {
          className: 'delete-dialog-overlay',
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': t('chat.stories.stealth.title'),
          'data-dialog': 'story-stealth',
        },
        el('div', { className: 'delete-dialog' }, [
          el('h3', { key: 'h' }, t('chat.stories.stealth.title')),
          el('p', { key: 'p' }, t('chat.stories.stealth.about')),
          el('ul', { key: 'u', className: 'story-stealth-list' }, [
            el('li', { key: 'a' }, t('chat.stories.stealth.past')),
            el('li', { key: 'b' }, t('chat.stories.stealth.future')),
          ]),
          el(StealthStatus, { key: 's', t, status }),
          code
            ? el(
                'p',
                { key: 'e', role: 'alert', 'data-stealth-error': code },
                stealthError(t, code)
              )
            : null,
          el('div', { key: 'b', className: 'delete-dialog-btns' }, [
            el(
              'button',
              {
                key: 'n',
                type: 'button',
                'data-action': 'cancel',
                onClick: onClose,
              },
              t('chat.stories.close')
            ),
            el(
              'button',
              {
                key: 'y',
                type: 'button',
                'data-action': 'story-stealth-enable',
                disabled: busy || status.wait > 0,
                onClick: enable,
              },
              t('chat.stories.stealth.enable')
            ),
          ]),
        ])
      )
    ),
    globalThis.document.body
  );
};

/** "Report" on someone else's story: the chat report's own dialog. */
export const StoryReport = ({ api, peer, story, onClose }) => {
  const t = useT();
  return createPortal(
    el(
      'div',
      { className: 'story-dialog-host' },
      el(ReportDialog, {
        api,
        chat: { chat: peer.peer },
        onClose,
        t,
        // stories.report, walked as messages.report is (R-Y199).
        call: (body) => api.telegramStoryReport({ ...body, id: story.id }),
      })
    ),
    globalThis.document.body
  );
};

/** The viewers' search box and switches (the "Viewers" tab). */
export const ViewersFilters = ({ filter, onChange }) => {
  const t = useT();
  const [text, setText] = useState(filter.q);
  // The search is sent once typing pauses.
  useEffect(() => {
    const timer = globalThis.setTimeout(
      () => onChange({ q: text.trim() }),
      300
    );
    return () => globalThis.clearTimeout(timer);
  }, [text]);
  const check = (key, name, label) =>
    el('label', { key, className: 'story-viewers-check' }, [
      el('input', {
        key: 'c',
        type: 'checkbox',
        checked: filter[name],
        'data-viewers-filter': name,
        onChange: (e) => onChange({ [name]: e.target.checked }),
      }),
      ` ${label}`,
    ]);
  return el('div', { className: 'story-viewers-filters' }, [
    el('input', {
      key: 'q',
      type: 'search',
      className: 'story-viewers-search',
      'data-viewers-search': 'input',
      placeholder: t('chat.stories.search'),
      'aria-label': t('chat.stories.search'),
      maxLength: 128,
      value: text,
      onChange: (e) => setText(e.target.value),
    }),
    check('c', 'contacts', t('chat.stories.contactsOnly')),
    check('r', 'reactionsFirst', t('chat.stories.reactionsFirst')),
  ]);
};

/** The tabs of the viewers: who viewed, and the reactions and reposts. */
export const ViewersTabs = ({ tab, onTab }) => {
  const t = useT();
  return el(
    'div',
    { className: 'story-viewers-tabs', role: 'tablist' },
    ['viewers', 'reactions'].map((name) =>
      el(
        'button',
        {
          key: name,
          type: 'button',
          role: 'tab',
          className: `ghost story-viewers-tab${tab === name ? ' is-on' : ''}`,
          'aria-selected': tab === name ? 'true' : 'false',
          'data-viewers-tab': name,
          onClick: () => onTab(name),
        },
        t(`chat.stories.tab.${name}`)
      )
    )
  );
};

/**
 * Fresh counters of one's own story when it is opened
 * (stories.getStoriesViews): `patch(peer, id, fresh)` applies them.
 */
export const useViewsRefresh = ({ api, peer, story, patch }) => {
  const own = Boolean(story && (peer.self || story.mine));
  const key = own ? `${peer.peer}:${story.id}` : '';
  const latest = useRef(patch);
  latest.current = patch;
  useEffect(() => {
    if (!own || typeof api?.telegramStoriesViews !== 'function') {
      return undefined;
    }
    let live = true;
    Promise.resolve(
      api.telegramStoriesViews({ chat: peer.peer, ids: [story.id] })
    )
      .then((answer) => {
        const fresh = (answer?.stories ?? []).find((s) => s.id === story.id);
        if (live && answer?.ok && fresh) {
          latest.current(peer.peer, story.id, fresh);
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [api, key]);
};
