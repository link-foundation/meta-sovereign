import React from 'react';
import { useT } from './i18n.js';

const el = React.createElement;

/** Literal destinations share one review presentation across question surfaces. */
export const QuestionLinkTargets = ({ links }) => {
  const t = useT();
  return links?.length
    ? el('div', { className: 'col', 'data-question-links': true }, [
        el(
          'small',
          { key: 'label', className: 'meta' },
          t('browserAnswer.links')
        ),
        ...links.map((target, index) =>
          el('code', { key: index, className: 'wrap' }, target)
        ),
      ])
    : null;
};
