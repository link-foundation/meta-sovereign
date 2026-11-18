import React from 'react';
import { useT } from './i18n.js';
import { GratitudeSticker } from './gratitude-fields.js';
const el = React.createElement;

// Shared by the plan and the editable Chat/Operator draft review.
export const OrderedReplyReview = ({ draft, children }) => {
  const t = useT();
  return el('div', { 'data-ordered-reply': true }, [
    el('p', { key: 'hint', className: 'meta' }, t('engagement.hint')),
    el('ol', { key: 'steps' }, [
      el('li', { key: 'sticker', 'data-ordered-step': 1 }, [
        el(GratitudeSticker, {
          key: 'sticker',
          draft: { text: '', sticker: { id: draft.engagement.sticker } },
        }),
        el(
          'p',
          { key: 'status', className: 'meta' },
          t(
            `engagement.step.${draft.progress?.steps?.[0]?.status ?? 'pending'}`
          )
        ),
      ]),
      el('li', { key: 'text', 'data-ordered-step': 2 }, [
        children ?? el('blockquote', { key: 'text' }, draft.text),
        el(
          'p',
          { key: 'status', className: 'meta' },
          t(
            `engagement.step.${draft.progress?.steps?.[1]?.status ?? 'pending'}`
          )
        ),
      ]),
    ]),
  ]);
};
