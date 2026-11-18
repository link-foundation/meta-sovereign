import React from 'react';
import { useT } from './i18n.js';
import { action } from './publication-fields.js';
const h = React.createElement;
const Receipt = ({ receipt }) => {
  if (!receipt) {
    return null;
  }
  const ids = receipt.messageIds?.join(', ') ?? receipt.postId ?? receipt.id;
  return h(
    'span',
    { className: 'publication-receipt' },
    receipt.url
      ? h(
          'a',
          { href: receipt.url, target: '_blank', rel: 'noopener noreferrer' },
          ids
        )
      : `${receipt.chat ?? receipt.ownerId ?? ''} / ${ids}`
  );
};
export const PublicationHistory = ({ history, api, perform, reload, busy }) => {
  const t = useT();
  const remove = (record, entry) =>
    perform(async () => {
      const answer = await api.delete(
        { id: record.id, targetIds: [entry.targetId] },
        () =>
          globalThis.confirm(t('publication.deleteAsk', { label: entry.label }))
      );
      reload();
      if (answer.status === 'cancelled') {
        return t('broadcast.cancelled');
      }
      if (answer.status === 'unknown') {
        return t('publication.deletion.unknown');
      }
      if (answer.error) {
        throw new Error(answer.error);
      }
      const result = answer.results?.find(
        (item) => item.targetId === entry.targetId
      );
      return (
        result?.deletion?.error ??
        t(`publication.deletion.${result?.deletion?.status ?? 'failed'}`)
      );
    });
  return h(
    'section',
    { 'data-publication-history': true },
    history.length
      ? history.map((record) =>
          h('article', { key: record.id, className: 'publication-record' }, [
            h(
              'h4',
              { key: 'title' },
              `${record.createdAt} · ${t(`broadcast.${record.status}`)}`
            ),
            h('small', { key: 'id' }, record.id),
            h('blockquote', { key: 'body' }, record.body),
            record.debug &&
              h('details', { key: 'trace' }, [
                h('summary', { key: 'title' }, t('publication.debug')),
                h(
                  'pre',
                  { key: 'events' },
                  JSON.stringify(record.events ?? [], null, 2)
                ),
              ]),
            h(
              'ul',
              { key: 'results' },
              record.results.map((entry) =>
                h(
                  'li',
                  {
                    key: entry.targetId,
                    'data-publication-target': entry.targetId,
                  },
                  [
                    h('strong', { key: 'label' }, `${entry.label}: `),
                    t(`broadcast.${entry.status}`),
                    entry.error && h('p', { key: 'error' }, entry.error),
                    h(Receipt, { key: 'receipt', receipt: entry.receipt }),
                    entry.deletion &&
                      h(
                        'p',
                        { key: 'deletion' },
                        t(`publication.deletion.${entry.deletion.status}`)
                      ),
                    entry.deletion?.error &&
                      h('p', { key: 'deleteError' }, entry.deletion.error),
                    entry.receipt &&
                      (!entry.deletion || entry.deletion.status === 'failed') &&
                      action(
                        t('publication.deletePost'),
                        () => remove(record, entry),
                        busy,
                        { key: 'delete' }
                      ),
                  ]
                )
              )
            ),
          ])
        )
      : h('p', null, t('publication.noHistory'))
  );
};
