import { registerDefaultHandlers } from './handlers-bootstrap.js';

const stopAccounts = (ctx, handoff) =>
  Promise.allSettled(
    [ctx.telegramAccount, ctx.telegramAccounts, ctx.telegramExtras].map(
      (service) =>
        Promise.resolve().then(() =>
          service?.stop(handoff ? { handoff: true } : undefined)
        )
    )
  );

export const createRuntimeLifecycle = ({
  server,
  ctx,
  store,
  later,
  enableHandlers,
  sockets,
  flush,
  flushLog,
}) => {
  let bus = null;
  let started = false;
  let closing = null;
  const activate = () => {
    if (!started) {
      started = true;
      bus = enableHandlers
        ? registerDefaultHandlers(store, { browser: () => ctx.send })
        : null;
      later.forEach((start) => start());
    }
    server.requestGate.activate();
  };
  const stopRuntime = () => {
    bus?.close();
    ctx.replies.close().catch(() => {});
    ctx.closeAutomations().catch(() => {});
    ctx.chatIndex.close();
    ctx.knowledge?.close();
    return Promise.allSettled([
      ctx.stopJobs(),
      ctx.marketplaceSessions?.stop(),
    ]);
  };
  return {
    activate,
    get bus() {
      return bus;
    },
    stopRuntime,
    close: (listening, transports, { handoff = false } = {}) => {
      if (closing) {
        return closing;
      }
      const startedAt = Date.now();
      const trace = (stage) => {
        if (process.env.MS_LIFECYCLE_DEBUG === '1') {
          console.error(
            `[lifecycle] ${stage} after ${Date.now() - startedAt} ms (${sockets.size} owned connections)`
          );
        }
      };
      trace('close_started');
      const jobsDone = stopRuntime().then((result) => {
        trace('jobs_stopped');
        return result;
      });
      const accountsDone = stopAccounts(ctx, handoff);
      transports.wsHandle?.close();
      transports.signaling?.close();
      listening.closeFront();
      closing = new Promise((resolve) => {
        server.close(() => {
          trace('http_closed');
          resolve();
        });
        for (const socket of sockets) {
          socket.destroy();
        }
      })
        .then(() => (handoff ? accountsDone : jobsDone))
        .then(() => {
          trace('flush_started');
          return Promise.resolve(handoff ? flushLog?.() : flush()).catch(
            () => {}
          );
        })
        .then((result) => {
          trace('close_finished');
          return result;
        });
      return closing;
    },
  };
};
