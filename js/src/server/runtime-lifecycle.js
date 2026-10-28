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
      const jobsDone = stopRuntime();
      const accountsDone = stopAccounts(ctx, handoff);
      transports.wsHandle?.close();
      transports.signaling?.close();
      listening.closeFront();
      closing = new Promise((resolve) => {
        server.close(resolve);
        for (const socket of sockets) {
          socket.destroy();
        }
      })
        .then(() => (handoff ? accountsDone : jobsDone))
        .then(() =>
          Promise.resolve(handoff ? flushLog?.() : flush()).catch(() => {})
        );
      return closing;
    },
  };
};
