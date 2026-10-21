/**
 * Loading, as Telegram's apps show it (R-Y84): an arc that turns while
 * it grows and shrinks (Desktop's InfiniteRadialAnimation, Web A's
 * Spinner; learned, never copied).
 *
 * - `Spinner` — the arc, at the size of the text around it, or `large`.
 * - `PageLoading` — a page (or a pane) still loading: the arc in its
 *   middle, shown after a moment so a quick load does not flash.
 * - `Busy` — a line of text with the arc before it ("Updating…").
 * - `ChatListSkeleton` — the chat list's rows before they come, as Web A
 *   draws them: a round avatar and two lines, shimmering.
 *
 * A button that is working says so with `aria-busy="true"`: app.css puts
 * the arc in it.
 */

import React from 'react';
import { useT } from './i18n.js';

const el = React.createElement;

export const Spinner = ({ size = 'small', label = null }) =>
  el(
    'span',
    {
      className: `spinner spinner-${size}`,
      ...(label
        ? { role: 'img', 'aria-label': label }
        : { 'aria-hidden': 'true' }),
    },
    el(
      'svg',
      { viewBox: '0 0 24 24', focusable: 'false' },
      el('circle', { cx: 12, cy: 12, r: 10 })
    )
  );

export const PageLoading = ({ label = null }) => {
  const t = useT();
  const text = label ?? t('common.loading');
  return el(
    'div',
    { className: 'page-loading', role: 'status', 'aria-live': 'polite' },
    [
      el(Spinner, { key: 's', size: 'large' }),
      el('span', { key: 't', className: 'sr-only' }, text),
    ]
  );
};

export const Busy = ({ as = 'p', className = '', children, ...rest }) =>
  el(
    as,
    {
      className: ['meta busy', className].filter(Boolean).join(' '),
      role: 'status',
      ...rest,
    },
    [
      el(Spinner, { key: 's' }),
      el('span', { key: 't', className: 'busy-text' }, children),
    ]
  );

const SKELETON_ROWS = 9;

export const ChatListSkeleton = ({ rows = SKELETON_ROWS }) =>
  el(
    'div',
    { className: 'chat-skeleton', 'aria-hidden': 'true' },
    Array.from({ length: rows }, (_, i) =>
      el('div', { key: i, className: 'chat-skeleton-row' }, [
        el('span', { key: 'a', className: 'skeleton chat-skeleton-avatar' }),
        el('span', { key: 'b', className: 'chat-skeleton-body' }, [
          el('span', {
            key: 'n',
            className: 'skeleton chat-skeleton-line',
            // Names and previews are not all as long.
            style: { width: `${45 + ((i * 37) % 35)}%` },
          }),
          el('span', {
            key: 'p',
            className: 'skeleton chat-skeleton-line is-short',
            style: { width: `${60 + ((i * 53) % 30)}%` },
          }),
        ]),
      ])
    )
  );
