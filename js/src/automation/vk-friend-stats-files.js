/** Rebuildable, private Lino projections; old month/week files stay untouched. */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Link, formatLinks } from 'links-notation';
import { writeFileDurable } from '../storage/durable.js';
import { createStoreQueue } from '../storage/serialized.js';
import { readVkFriendStats } from './vk-friend-stats.js';

const serialize = createStoreQueue();
const format = (fields) =>
  `${formatLinks(
    Object.entries(fields)
      .filter(([, value]) => value !== null)
      .map(([key, value]) => new Link(key, [new Link(String(value))]))
  )}\n`;
const writeChanged = async (path, fields) => {
  const next = format(fields);
  let before;
  try {
    before = await readFile(path, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
  if (before !== next) {
    await writeFileDurable(path, next);
  }
};

export const publishVkFriendStats = (store, directory, accountId, time) =>
  serialize(store, async () => {
    const snapshot = await readVkFriendStats(store, time);
    const summary = snapshot.accounts.find(
      (row) => row.accountId === accountId
    );
    if (!summary) {
      return;
    }
    const root = join(directory, 'stats', 'vk-friends', String(accountId));
    const common = { accountId, timezone: 'UTC' };
    await writeChanged(join(root, 'total.lino'), {
      ...common,
      acceptedFriends: summary.total,
      undated: summary.undated,
      initialFriendsCount: summary.initialFriendsCount,
      observedAt: summary.observedAt,
    });
    await writeChanged(join(root, 'months', `${snapshot.month}.lino`), {
      ...common,
      month: snapshot.month,
      acceptedFriends: summary.month,
    });
    await writeChanged(join(root, 'weeks', `${snapshot.week}.lino`), {
      ...common,
      weekStarting: snapshot.week,
      acceptedFriends: summary.week,
    });
  });
