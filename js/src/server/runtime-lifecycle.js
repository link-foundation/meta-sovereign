import { registerDefaultHandlers } from './handlers-bootstrap.js';
import { closeTelegramLogins } from './telegram-login-registry.js';

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
  releaseStore,
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
    ctx.publicationsClosing = true;
    ctx.followClosing = true;
    bus?.close();
    ctx.chatIndex.close();
    ctx.knowledge?.close();
    return Promise.allSettled([
      ctx.replies.close(),
      ctx.closeAutomations(),
      ctx.stopJobs(),
      ctx.marketplaceSessions?.stop(),
      ctx.publications?.close(),
      ctx.followBacklinks?.stop(),
      ctx.followDiscovery?.stop(),
      ctx.forms?.stop(),
      ctx.answerModel?.stop?.(),
      closeTelegramLogins(ctx),
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
        .then(() => Promise.all([accountsDone, jobsDone]))
        .then(() => {
          trace('flush_started');
          return Promise.resolve(handoff ? flushLog?.() : flush()).catch(
            () => {}
          );
        })
        .finally(() => releaseStore?.())
        .then((result) => {
          trace('close_finished');
          return result;
        });
      return closing;
    },
  };
};
