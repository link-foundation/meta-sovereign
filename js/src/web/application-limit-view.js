import React from 'react';

const el = React.createElement;
export const ApplicationLimitView = ({ application, t }) => {
  const limit =
    application.queue?.applicationLimit ??
    application.receipt?.applicationLimit;
  return limit
    ? el(
        'div',
        {
          className: 'col',
          'data-application-limit': limit.active ? 'waiting' : 'elapsed',
          role: 'status',
        },
        [
          el(
            'p',
            { key: 'deadline', 'data-application-limit-until': limit.until },
            t(
              limit.active
                ? 'application.limitWaiting'
                : 'application.limitElapsed',
              { at: limit.until }
            )
          ),
          el(
            'p',
            { key: 'scope', className: 'meta' },
            t('application.limitScope')
          ),
          !limit.saved
            ? el(
                'p',
                { key: 'unsaved', role: 'alert' },
                t('application.limitUnsaved')
              )
            : null,
        ]
      )
    : null;
};
