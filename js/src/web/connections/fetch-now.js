// The "Fetch now" button of a network's Connections card (R-Z8): reads the
// network's inbox through POST /api/pull (at most one fetch per 15 s on the
// server) and says what happened. The app also fetches by itself in the
// background; this is the manual one.

import React, { useState } from 'react';
import { api } from '../dom.js';
import { useT } from '../i18n.js';
import { Busy } from '../spinner.js';

const el = React.createElement;

/** The networks whose inbox the server pulls on demand and on a schedule. */
export const FETCHABLE = new Set(['vk', 'upwork', 'peopleperhour']);

/** The message to show for the server's answer to a pull. */
export const pullMessage = (t, answer) => {
  if (answer?.ok) {
    return {
      tone: 'ok',
      text: t('pull.done', { count: answer.imported ?? 0 }),
    };
  }
  if (answer?.code === 'rate-limited') {
    const seconds = Math.max(
      1,
      Math.ceil((answer.retryAfterMs ?? 15000) / 1000)
    );
    return { tone: 'wait', text: t('pull.rateLimited', { seconds }) };
  }
  if (answer?.code === 'not-connected') {
    return { tone: 'error', text: t('pull.notConnected') };
  }
  return {
    tone: 'error',
    text: t('pull.failed', { error: answer?.error ?? answer?.code ?? '?' }),
  };
};

export const FetchNow = ({ providerId, before = null, disabled = false }) => {
  const t = useT();
  const [state, setState] = useState({ busy: false, result: null });
  const fetchNow = async () => {
    setState({ busy: true, result: null });
    // `before` saves what the fetch depends on (GitHub's chosen repositories).
    await before?.();
    const answer = await api.pullInbox(providerId);
    setState({ busy: false, result: pullMessage(t, answer) });
  };
  return el(
    'div',
    { className: 'row fetch-now', 'data-fetch-now': providerId },
    [
      el(
        'button',
        {
          key: 'b',
          type: 'button',
          'data-action': 'fetch-now',
          'data-target-provider': providerId,
          disabled: state.busy || disabled,
          'aria-busy': state.busy ? 'true' : undefined,
          onClick: fetchNow,
        },
        state.busy ? t('pull.fetching') : t('pull.fetchNow')
      ),
      state.busy
        ? el(Busy, { key: 's', as: 'span' }, t('pull.fetching'))
        : el(
            'span',
            {
              key: 's',
              className: `meta fetch-status fetch-${state.result?.tone ?? 'idle'}`,
              role: 'status',
              'data-fetch-status': state.result?.tone ?? 'idle',
            },
            state.result?.text ?? t('pull.hint')
          ),
    ]
  );
};
