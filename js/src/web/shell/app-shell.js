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

import React from 'react';
import { useT } from '../i18n.js';
import { navItems } from '../nav-items.js';

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

const NavButton = ({ id, label, active, onSelect, variant }) =>
  el(
    'button',
    {
      type: 'button',
      'data-view': id,
      'data-tutorial-id': `nav:${id}`,
      className: `nav-item nav-item-${variant}${active ? ' active' : ''}`,
      'aria-current': active ? 'page' : undefined,
      onClick: () => onSelect(id),
    },
    label
  );

const renderNavButtons = (t, active, onSelect, variant) =>
  navItems.map(([id, labelKey]) =>
    el(NavButton, {
      key: id,
      id,
      label: t(labelKey),
      active: id === active,
      onSelect,
      variant,
    })
  );

const BottomNav = ({ active, onSelect, t }) =>
  el(
    'nav',
    {
      className: 'bottom-nav glass',
      role: 'navigation',
      'aria-label': t('shell.primaryNavAria'),
    },
    renderNavButtons(t, active, onSelect, 'bottom')
  );

const SideRail = ({ active, onSelect, t }) =>
  el(
    'nav',
    {
      className: 'side-rail glass',
      role: 'navigation',
      'aria-label': t('shell.primaryNavAria'),
    },
    renderNavButtons(t, active, onSelect, 'rail')
  );

const PermanentDrawer = ({ active, onSelect, t }) =>
  el(
    'nav',
    {
      className: 'permanent-drawer glass',
      role: 'navigation',
      'aria-label': t('shell.primaryNavAria'),
    },
    renderNavButtons(t, active, onSelect, 'drawer')
  );

export const AppShell = ({ width, active, onSelect, children }) => {
  const t = useT();
  const layout = classifyViewport(width);
  return el(
    'div',
    { className: `app-shell app-shell-${layout}`, 'data-layout': layout },
    [
      layout === 'expanded'
        ? el(PermanentDrawer, { key: 'drawer', active, onSelect, t })
        : null,
      layout === 'medium'
        ? el(SideRail, { key: 'rail', active, onSelect, t })
        : null,
      el('div', { key: 'body', className: 'app-shell-body' }, children),
      layout === 'compact'
        ? el(BottomNav, { key: 'bottom', active, onSelect, t })
        : null,
    ]
  );
};
