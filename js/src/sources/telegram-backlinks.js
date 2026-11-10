import { createTelegramBacklinkRuntime } from './telegram-backlink-runtime.js';
import {
  telegramBacklinkTarget,
  telegramBacklinkHistory,
  readTelegramBacklinks,
  telegramBacklinkId,
} from './telegram-backlink-shape.js';
import { followKind } from './telegram-follow-shape.js';
import { randomIdOf } from './telegram-send.js';
import { messageReceipt } from './telegram-message-receipt.js';
import { backlinkFailure, backlinkInteger } from '../follow/backlink-shape.js';
import { telegramOperationUpdates } from './telegram-membership-receipt.js';

export const createTelegramBacklinks = (env, context) => {
  const runtime = createTelegramBacklinkRuntime(env, context);
  return {
    followBacklinkAdapter: () => {
      const run = runtime();
      return {
        describe: (chat) =>
          run(async (c, owner) => {
            const target = await telegramBacklinkTarget(env, c, chat);
            return {
              owner,
              chat: target.chat,
              title: target.title,
              canWrite: target.canWrite,
              canCleanup: target.canCleanup,
            };
          }),
        post: ({ chat, backlink, key, cancelled, read = (use) => use() }) =>
          run(async (c) => {
            const target = await read(() =>
              telegramBacklinkTarget(env, c, chat)
            );
            if (!target.canWrite) {
              throw backlinkFailure('not-writable');
            }
            const request = new c.Api.messages.SendMessage({
              peer: target.peer,
              message: backlink,
              randomId: randomIdOf(key, 0, c.helpers),
              noWebpage: true,
              clearDraft: false,
            });
            await read(() => c.checkAccount(cancelled));
            const answer = await c.invoke(request);
            const id = messageReceipt(answer, request);
            const updates = telegramOperationUpdates(answer);
            if (updates) {
              try {
                await context.apply(c.client, updates);
              } catch {
                if (process.env.MS_FOLLOW_DEBUG === '1') {
                  env.log?.({
                    level: 'debug',
                    event: 'follow_backlink_projection_failed',
                    source: 'telegram',
                  });
                }
              }
            }
            return { chat, id };
          }, true),
        inspect: ({ chat, id }) =>
          run(async (c) => {
            const target = await telegramBacklinkTarget(env, c, chat);
            const [message] = await readTelegramBacklinks(c, target, [id]);
            if (
              followKind(message) !== 'MessageEmpty' &&
              (followKind(message) !== 'Message' ||
                message.out !== true ||
                message.action)
            ) {
              throw backlinkFailure('provider-response');
            }
            return {
              chat,
              id,
              state:
                followKind(message) === 'MessageEmpty' ? 'removed' : 'present',
            };
          }),
        retryNotice: () => Promise.resolve(false),
        incoming: ({ chat, limit }) =>
          run(async (c) => {
            const target = await telegramBacklinkTarget(env, c, chat);
            if (!target.canCleanup) {
              throw backlinkFailure('cleanup-unavailable');
            }
            const rows = await telegramBacklinkHistory(
              c,
              target,
              backlinkInteger(limit, 200, 1, 200)
            );
            return rows
              .filter(
                (row) =>
                  followKind(row) === 'Message' && !row.out && !row.action
              )
              .map((row) => String(row.id));
          }),
        deleteIncoming: ({ chat, ids, cancelled, read = (use) => use() }) =>
          run(async (c) => {
            const target = await read(() =>
              telegramBacklinkTarget(env, c, chat)
            );
            if (!target.canCleanup) {
              throw backlinkFailure('cleanup-unavailable');
            }
            if (
              !Array.isArray(ids) ||
              !ids.length ||
              ids.length > 200 ||
              new Set(ids).size !== ids.length
            ) {
              throw backlinkFailure('bad-request');
            }
            const before = await read(() =>
              readTelegramBacklinks(c, target, ids)
            );
            if (
              before.some(
                (row) => followKind(row) !== 'Message' || row.out || row.action
              )
            ) {
              throw backlinkFailure('provider-response');
            }
            await read(() => c.checkAccount(cancelled));
            const answer = await c.invoke(
              new c.Api.messages.DeleteMessages({
                id: ids.map((id) => Number(telegramBacklinkId(id))),
                revoke: false,
              })
            );
            if (
              followKind(answer) !== 'AffectedMessages' ||
              !Number.isInteger(answer.pts) ||
              answer.pts < 0 ||
              !Number.isInteger(answer.ptsCount) ||
              answer.ptsCount < 0
            ) {
              throw backlinkFailure('outcome-unknown');
            }
            const after = await read(() =>
              readTelegramBacklinks(c, target, ids)
            );
            return {
              confirmed: after
                .filter((row) => followKind(row) === 'MessageEmpty')
                .map((row) => String(row.id)),
            };
          }, true),
      };
    },
  };
};
