import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';

const el = React.createElement;

/** One observed action receipt, with no focus transfer or polling announcement. */
export const RunnerFeedback = ({ feedback }) => {
  const t = useT();
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (!visible) {
      return;
    }
    const dismiss = (event) => {
      if (event.key === 'Escape') {
        setVisible(false);
      }
    };
    const timer = globalThis.setTimeout(() => setVisible(false), 8000);
    document.addEventListener('keydown', dismiss);
    return () => {
      globalThis.clearTimeout(timer);
      document.removeEventListener('keydown', dismiss);
    };
  }, [visible]);
  return visible
    ? el(
        'aside',
        {
          className: 'runner-feedback',
          role: 'status',
          'aria-live': 'polite',
          'aria-atomic': 'true',
          'data-runner-feedback': `${feedback.mode}-${feedback.action}`,
        },
        [
          el('div', { key: 'message' }, [
            el(
              'p',
              { key: 'state' },
              `${t(`runner.${feedback.mode}`)}: ${t(`runner.${feedback.state}`)}`
            ),
            el(
              'p',
              { key: 'scope', className: 'meta' },
              t('runner.feedbackScope')
            ),
          ]),
          el(
            'button',
            {
              key: 'dismiss',
              type: 'button',
              'data-runner-feedback-dismiss': '',
              'aria-label': t('runner.dismissFeedback'),
              onClick: () => setVisible(false),
            },
            '×'
          ),
        ]
      )
    : null;
};
