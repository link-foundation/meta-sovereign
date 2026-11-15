import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';
import {
  followVkFriendStats,
  VK_FRIEND_STATS_UPDATED,
} from './vk-friend-stats-feed.js';

const el = React.createElement;
export const VkFriendStatsBanner = ({ api }) => {
  const t = useT();
  const [snapshot, setSnapshot] = useState(null);
  const [stale, setStale] = useState(false);
  useEffect(() => {
    const feed = followVkFriendStats({
      read: (signal) => api.vkFriendStats(signal),
      update: (value) => {
        setSnapshot(value);
        setStale(false);
      },
      fail: () => setStale(true),
    });
    globalThis.addEventListener(VK_FRIEND_STATS_UPDATED, feed.refresh);
    return () => {
      globalThis.removeEventListener(VK_FRIEND_STATS_UPDATED, feed.refresh);
      feed.close();
    };
  }, [api]);
  const accounts = snapshot?.accounts.filter((row) => row.total > 0) ?? [];
  if (!accounts.length) {
    return null;
  }
  return el(
    'aside',
    {
      className: 'vk-friend-stats',
      'data-vk-friend-stats': '',
      'aria-label': t('vkFriendStats.title'),
    },
    [
      el('span', { key: 'title', className: 'meta' }, t('vkFriendStats.title')),
      ...accounts.map((row) =>
        el('details', { key: row.accountId }, [
          el(
            'summary',
            { key: 'summary', 'data-vk-friend-stats-account': row.accountId },
            t('vkFriendStats.summary', { id: row.accountId, count: row.total })
          ),
          el(
            'p',
            { key: 'initial' },
            row.initialFriendsCount === null
              ? t('vkFriendStats.initialUnknown')
              : t('vkFriendStats.initial', { count: row.initialFriendsCount })
          ),
          el(
            'p',
            { key: 'period' },
            t('vkFriendStats.period', {
              month: snapshot.month,
              monthly: row.month,
              week: snapshot.week,
              weekly: row.week,
            })
          ),
          row.undated
            ? el(
                'p',
                { key: 'undated', className: 'meta' },
                t('vkFriendStats.undated', { count: row.undated })
              )
            : null,
        ])
      ),
      stale || snapshot.cached
        ? el(
            'span',
            { key: 'stale', className: 'meta', role: 'status' },
            t(stale ? 'vkFriendStats.stale' : 'vkFriendStats.cached')
          )
        : null,
    ]
  );
};
