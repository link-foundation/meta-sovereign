// A card/section header: a heading plus the green "recommended" tag. Shared
// by the browser auto-import panel and the Telegram session finder so the
// identical markup is written once, not duplicated per panel.

import React from 'react';
import { useT } from '../i18n.js';

const el = React.createElement;

export const RecommendedHeader = ({ tag, titleClass, titleKey, className }) => {
  const t = useT();
  return el('header', { className: `row ${className}` }, [
    el(tag, { key: 'title', className: titleClass }, t(titleKey)),
    el(
      'span',
      { key: 'tag', className: 'recommended-tag' },
      t('connections.recommended')
    ),
  ]);
};
