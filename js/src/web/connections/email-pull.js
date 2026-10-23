// "Fetch mail now" on the Email card (R-Z5): pulls new mail from the saved
// connection (host, login and password, or a token) through the local
// server. The server pulls only what is new, and at most once every
// fifteen seconds; a refusal is shown as it is, never as a success.

import React, { useState } from 'react';
import { api } from '../dom.js';
import { useT } from '../i18n.js';

const el = React.createElement;

const messageOf = (t, result) => {
  if (result.ok) {
    return t('email.pull.done', { count: result.imported ?? 0 });
  }
  if (result.code === 'rate-limited') {
    return t('email.pull.rateLimited', { seconds: result.retryAfter ?? 15 });
  }
  return t('email.pull.failed', { message: result.error ?? '' });
};

export const EmailPullRow = () => {
  const t = useT();
  const [state, setState] = useState({ status: 'idle', text: '' });
  const pull = async () => {
    setState({ status: 'working', text: t('email.pull.working') });
    const result = await api.emailPull({});
    setState({
      status: result.ok ? 'done' : 'failed',
      text: messageOf(t, result),
    });
  };
  return el('div', { className: 'col email-pull' }, [
    el('div', { key: 'row', className: 'row' }, [
      el(
        'button',
        {
          key: 'pull',
          type: 'button',
          className: 'primary',
          disabled: state.status === 'working',
          'aria-busy': state.status === 'working' ? 'true' : undefined,
          'data-action': 'email-pull',
          onClick: pull,
        },
        t('email.pull.button')
      ),
      el(
        'span',
        {
          key: 'status',
          className: `meta email-pull-status is-${state.status}`,
          role: 'status',
          'data-email-pull': state.status,
        },
        state.text
      ),
    ]),
    el('p', { key: 'hint', className: 'meta' }, t('email.pull.hint')),
  ]);
};
