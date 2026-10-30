// Mobile-first AppShell (issue #25 R-N1, R-N2, R-N11).
//
// The shell picks a primary-nav surface from the current viewport
// width using Material 3's responsive breakpoints:
//   * compact   ≤ 640 px → bottom navigation (thumb reach, mobile)
//   * medium    641–1023 → side navigation rail (tablet)
//   * expanded  ≥ 1024  → permanent left drawer (desktop)
//
// Every surface uses the same React components, the same `navItems`
// catalogue, and the same active-view contract — only the rendered
// chrome differs. This keeps the existing app.js wiring (active view
// state, language switcher, theme toggle) intact while satisfying
// R-N1's "mobile first" mandate.
//
// `classifyViewport(width)` is exported on its own so tests can pin
// the boundary behaviour without rendering the whole shell.

import React, { useEffect, useState } from 'react';
import { useT } from '../i18n.js';
import { navItems } from '../nav-items.js';
import { Icon } from '../icons.js';
import { PanelDivider } from '../panel-resize.js';

const el = React.createElement;

export const COMPACT_MAX = 640;
export const MEDIUM_MAX = 1023;

export const classifyViewport = (width) => {
  if (
    typeof width !== 'number' ||
    Number.isNaN(width) ||
    width <= COMPACT_MAX
  ) {
    return 'compact';
  }
  if (width <= MEDIUM_MAX) {
    return 'medium';
  }
  return 'expanded';
};

// The bottom bar keeps five thumb-sized slots (Material 3 allows 3–5):
// the four most used sections plus "More", which opens a sheet with
// the rest. The sheet stays in the DOM (hidden) so every section keeps
// its `data-view` button and `aria-current` at every width.
export const COMPACT_PRIMARY = [
  'chat',
  'contacts',
  'automation',
  'connections',
];

const NavButton = ({
  id,
  label,
  short,
  active,
  onSelect,
  variant,
  badge,
  description,
}) =>
  el(
    'button',
    {
      type: 'button',
      'data-view': id,
      'data-tutorial-id': `nav:${id}`,
      className: `nav-item nav-item-${variant}${active ? ' active' : ''}`,
      'aria-current': active ? 'page' : undefined,
      'aria-label': badge?.count > 0 ? `${label}, ${description}` : undefined,
      title: variant === 'rail' || short !== label ? label : undefined,
      onClick: () => onSelect(id),
    },
    [
      el('span', { key: 'icon', className: 'nav-icon' }, [
        el(Icon, { key: 'i', name: id }),
        badge?.count > 0
          ? el(
              'span',
              {
                key: 'count',
                className: 'nav-count',
                'data-nav-count': id,
                'aria-hidden': 'true',
                title: description,
              },
              badge.count > 99
                ? '99+'
                : `${badge.count}${badge.more ? '+' : ''}`
            )
          : null,
      ]),
      el('span', { key: 'l', className: 'nav-label' }, short),
    ]
  );

// The bottom bar's slots and the rail are ~70 px wide, so a locale may
// give a section a shorter `nav.short.<id>` label there (Material 3 asks for
// labels that fit rather than truncate); the full name stays as the
// tooltip. The visible label remains the accessible name (WCAG 2.5.3).
const shortLabel = (t, id, label, variant) => {
  const key = `nav.short.${id}`;
  const short = variant === 'bottom' || variant === 'rail' ? t(key) : key;
  return short === key ? label : short;
};

const renderNavButtons = (
  t,
  active,
  onSelect,
  variant,
  items = navItems,
  counts = {}
) =>
  items.map(([id, labelKey]) =>
    el(NavButton, {
      key: id,
      id,
      label: t(labelKey),
      short: shortLabel(t, id, t(labelKey), variant),
      active: id === active,
      onSelect,
      variant,
      badge:
        typeof counts[id] === 'object' ? counts[id] : { count: counts[id] },
      description: t(
        id === 'calls' && counts[id]?.more
          ? 'nav.unreadAtLeast'
          : ['chat', 'calls', 'operator'].includes(id)
            ? `nav.unread.${id}`
            : 'nav.unreadCount',
        { count: counts[id]?.count ?? counts[id] ?? 0 }
      ),
    })
  );

const BottomNav = ({ active, onSelect, t, counts }) => {
  const [open, setOpen] = useState(false);
  const primary = navItems.filter(([id]) => COMPACT_PRIMARY.includes(id));
  const rest = navItems.filter(([id]) => !COMPACT_PRIMARY.includes(id));
  const inRest = rest.some(([id]) => id === active);
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onKey = (event) => event.key === 'Escape' && setOpen(false);
    globalThis.addEventListener?.('keydown', onKey);
    return () => globalThis.removeEventListener?.('keydown', onKey);
  }, [open]);
  const pick = (id) => {
    setOpen(false);
    onSelect(id);
  };
  return el(React.Fragment, null, [
    el('div', {
      key: 'scrim',
      className: 'more-scrim',
      hidden: !open,
      onClick: () => setOpen(false),
    }),
    el(
      'div',
      {
        key: 'sheet',
        id: 'more-sheet',
        className: 'more-sheet glass',
        role: 'group',
        'aria-label': t('shell.moreAria'),
        hidden: !open,
      },
      renderNavButtons(t, active, pick, 'sheet', rest, counts)
    ),
    el(
      'nav',
      {
        key: 'bar',
        className: 'bottom-nav glass',
        role: 'navigation',
        'aria-label': t('shell.primaryNavAria'),
      },
      [
        ...renderNavButtons(t, active, pick, 'bottom', primary, counts),
        el(
          'button',
          {
            key: 'more',
            type: 'button',
            className: `nav-item nav-item-bottom nav-more${
              inRest || open ? ' active' : ''
            }`,
            'data-action': 'nav-more',
            'aria-expanded': String(open),
            'aria-controls': 'more-sheet',
            'data-tutorial-id': 'nav:more',
            onClick: () => setOpen(!open),
          },
          [
            el(Icon, { key: 'i', name: 'more' }),
            el('span', { key: 'l', className: 'nav-label' }, t('shell.more')),
          ]
        ),
      ]
    ),
  ]);
};

const SideRail = ({ active, onSelect, t, counts }) =>
  el(
    'nav',
    {
      className: 'side-rail glass',
      role: 'navigation',
      'aria-label': t('shell.primaryNavAria'),
    },
    renderNavButtons(t, active, onSelect, 'rail', navItems, counts)
  );

const PermanentDrawer = ({ active, onSelect, t, counts }) =>
  el(
    'nav',
    {
      className: 'permanent-drawer glass',
      role: 'navigation',
      'aria-label': t('shell.primaryNavAria'),
    },
    [
      el(PanelDivider, {
        key: 'resize',
        name: 'navigation',
        variable: '--nav-width',
        initial: 232,
        min: 160,
        max: 420,
      }),
      el(
        'div',
        { key: 'items', className: 'permanent-drawer-items' },
        renderNavButtons(t, active, onSelect, 'drawer', navItems, counts)
      ),
    ]
  );

export const AppShell = ({
  width,
  active,
  onSelect,
  children,
  counts = {},
}) => {
  const t = useT();
  const layout = classifyViewport(width);
  return el(
    'div',
    { className: `app-shell app-shell-${layout}`, 'data-layout': layout },
    [
      layout === 'expanded'
        ? el(PermanentDrawer, { key: 'drawer', active, onSelect, t, counts })
        : null,
      layout === 'medium'
        ? el(SideRail, { key: 'rail', active, onSelect, t, counts })
        : null,
      el('div', { key: 'body', className: 'app-shell-body' }, children),
      layout === 'compact'
        ? el(BottomNav, { key: 'bottom', active, onSelect, t, counts })
        : null,
    ]
  );
};
