import { randomUUID } from 'node:crypto';
import { connect, runIn } from './telegram-stickers.js';
import { invokeTelegramWrite } from './telegram-membership-receipt.js';
import { backlinkFailure } from '../follow/backlink-shape.js';
import { followKind, followText } from './telegram-follow-shape.js';

export const createTelegramBacklinkRuntime = (env, context) => {
  const pending = new Set();
  let stopped = false;
  const check = () => {
    if (stopped) {
      throw backlinkFailure('stopped');
    }
  };
  const owned = (use) => {
    const task = Promise.resolve().then(() => {
      check();
      return use();
    });
    pending.add(task);
    task.then(
      () => pending.delete(task),
      () => pending.delete(task)
    );
    return task;
  };
  env.followBacklinkStop = async () => {
    stopped = true;
    while (pending.size) {
      await Promise.allSettled([...pending]);
    }
  };
  return () => {
    let bound;
    return (use, write = false) =>
      owned(async () => {
        const c = await connect(env, context.userClient);
        check();
        if (!c) {
          throw backlinkFailure('user-account-required');
        }
        c.invoke = (request) => invokeTelegramWrite(c.client, request);
        let actual;
        let queueError;
        // A queue deadline must not release this adapter's ownership of the
        // actual RPC, including reads that are still completing during stop.
        await runIn(env, `follow:backlink:${randomUUID()}`, () => {
          actual = Promise.resolve().then(async () => {
            check();
            const users = await c.invoke(
              new c.Api.users.GetUsers({ id: [new c.Api.InputUserSelf()] })
            );
            const me = users?.length === 1 ? users[0] : null;
            const owner = followText(me?.id);
            if (
              followKind(me) !== 'User' ||
              !/^[1-9]\d{0,19}$/u.test(owner) ||
              me.bot ||
              me.deleted
            ) {
              throw backlinkFailure('user-account-required');
            }
            if (bound && (bound.client !== c.client || bound.owner !== owner)) {
              throw backlinkFailure('account-changed');
            }
            bound ??= { client: c.client, owner };
            c.checkAccount = async (cancelled = () => false) => {
              check();
              if (cancelled()) {
                throw backlinkFailure('cancelled');
              }
              const latest = await c.invoke(
                new c.Api.users.GetUsers({ id: [new c.Api.InputUserSelf()] })
              );
              if (
                latest?.length !== 1 ||
                followKind(latest[0]) !== 'User' ||
                followText(latest[0]?.id) !== owner ||
                latest[0].bot ||
                latest[0].deleted ||
                (await context.userClient()) !== c.client
              ) {
                throw backlinkFailure('account-changed');
              }
              check();
              if (cancelled()) {
                throw backlinkFailure('cancelled');
              }
            };
            if ((await context.userClient()) !== c.client) {
              throw backlinkFailure('account-changed');
            }
            check();
            const result = await use(c, owner);
            // Keep a positive write receipt even when sign-in changed while
            // Telegram was answering. The journal still belongs to its owner.
            if (!write) {
              await c.checkAccount();
            }
            return result;
          });
          return actual;
        }).catch((error) => {
          queueError = error;
        });
        if (!actual) {
          throw queueError ?? backlinkFailure('read-failed');
        }
        return actual;
      });
  };
};
