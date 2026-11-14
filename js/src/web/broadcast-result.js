import React from 'react';
import { useT } from './i18n.js';
import { networkName } from './connection-guides.js';
import { broadcastResultState } from '../broadcast/outcomes.js';

const h = React.createElement;
export const BroadcastResult = ({ result }) => {
  const t = useT();
  if (!result) {
    return null;
  }
  const state =
    result.code === 'server-required' ? 'unavailable' : result.status;
  return h(
    'section',
    { role: 'status', 'aria-live': 'polite', 'data-broadcast-result': true },
    [
      h('p', { key: 'state' }, t(`broadcast.${state ?? 'failed'}`)),
      result.body && h('blockquote', { key: 'body' }, result.body),
      result.counts &&
        h('p', { key: 'counts' }, t('broadcast.counts', result.counts)),
      result.error && h('p', { key: 'error' }, result.error),
      h(
        'ul',
        { key: 'results' },
        (result.results ?? []).map((entry, index) =>
          h('li', { key: `${entry.network}:${index}` }, [
            h(
              'strong',
              { key: 'network' },
              `${networkName(t, entry.network)}: `
            ),
            t(`broadcast.${broadcastResultState(entry)}`),
            entry.error ? ` — ${entry.error}` : '',
          ])
        )
      ),
    ]
  );
};
