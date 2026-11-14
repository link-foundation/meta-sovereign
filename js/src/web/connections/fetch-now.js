// The "Fetch now" button of a network's Connections card (R-Z8): reads the
// network's inbox through POST /api/pull (at most one fetch per 15 s on the
// server) and says what happened. The app also fetches by itself in the
// background; this is the manual one.

import React, { useState } from 'react';
import { api } from '../dom.js';
import { useT } from '../i18n.js';
import { errorText } from '../api-errors.js';
import { Busy } from '../spinner.js';

const el = React.createElement;

/** Networks with a manual inbox pull; HH history is manual only. */
export const FETCHABLE = new Set(['vk', 'upwork', 'peopleperhour', 'hh']);

// Codes with a sentence of their own (R-Z20: a VK captcha needs the user).
const PLAIN_ERRORS = {
  captcha: 'pull.captcha',
  'not-connected': 'pull.notConnected',
};

const historyMessage = (t, answer) => {
  const status = answer.history.status;
  const key =
    answer.history.reason === 'changed-list'
      ? 'changed'
      : ['complete', 'limited'].includes(status)
        ? status
        : 'partial';
  return {
    tone: status === 'complete' ? 'ok' : 'wait',
    text: t(`pull.history.${key}`, {
      count: answer.imported ?? 0,
      chats: answer.history.chatsRead ?? 0,
      total: answer.history.messagesRead ?? 0,
    }),
  };
};

const failedMessage = (t, answer) => ({
  tone: 'error',
  text: t('pull.failed', {
    error: errorText(t, answer?.code, answer?.error ?? answer?.code ?? '?'),
  }),
});

/** The message to show for the server's answer to a pull. */
export const pullMessage = (t, answer) => {
  if (answer?.ok) {
    if (answer.history?.scope === 'available-api-history') {
      return historyMessage(t, answer);
    }
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
  const fixed = PLAIN_ERRORS[answer?.code];
  if (fixed) {
    return { tone: 'error', text: t(fixed) };
  }
  return failedMessage(t, answer);
};

export const FetchNow = ({ providerId, before = null, disabled = false }) => {
  const t = useT();
  const [state, setState] = useState({ busy: false, result: null });
  const fetchNow = async () => {
    setState({ busy: true, result: null });
    // `before` saves what the fetch depends on (GitHub's chosen repositories).
    try {
      await before?.();
      const answer = await api.pullInbox(providerId);
      setState({ busy: false, result: pullMessage(t, answer) });
    } catch (error) {
      setState({
        busy: false,
        result: pullMessage(t, { error: error.message }),
      });
    }
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
            state.result?.text ??
              t(providerId === 'hh' ? 'pull.history.hint' : 'pull.hint')
          ),
    ]
  );
};
