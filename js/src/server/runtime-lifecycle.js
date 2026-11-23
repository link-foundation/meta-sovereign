import { registerDefaultHandlers } from './handlers-bootstrap.js';
import { closeTelegramLogins } from './telegram-login-registry.js';
import { traceShutdown } from './shutdown-trace.js';

const stopAccounts = (ctx, handoff) =>
  Promise.allSettled(
    ['telegramAccount', 'telegramAccounts', 'telegramExtras'].map((name) =>
      traceShutdown(
        name,
        Promise.resolve().then(() =>
          ctx[name]?.stop(handoff ? { handoff: true } : undefined)
        )
      )
    )
  );

const stopExperienceExport = (ctx) => {
  ctx.cvExperienceClosing = true;
  return Promise.allSettled([
    traceShutdown('cvExperience', ctx.cvExperience?.close()),
    traceShutdown('cvExperiencePlans', ctx.cvExperiencePlans?.close()),
    traceShutdown(
      'cvLinkedinPositionJobs',
      ctx.cvLinkedinPositionJobs?.close()
    ),
    traceShutdown('cvFormalReports', ctx.cvFormalReports?.close()),
  ]);
};

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
    ctx.vacanciesClosing = true;
    const experienceDone = stopExperienceExport(ctx);
    bus?.close();
    ctx.chatIndex.close();
    ctx.knowledge?.close();
    return Promise.allSettled([
      traceShutdown('replies', ctx.replies.close()),
      traceShutdown('automations', ctx.closeAutomations()),
      traceShutdown('jobs', ctx.stopJobs()),
      traceShutdown('marketplaceSessions', ctx.marketplaceSessions?.stop()),
      traceShutdown('publications', ctx.publications?.close()),
      traceShutdown('followBacklinks', ctx.followBacklinks?.stop()),
      traceShutdown('followDiscovery', ctx.followDiscovery?.stop()),
      traceShutdown('vkCache', ctx.vkCache?.close()),
      traceShutdown('vkStickers', ctx.vkStickers?.close()),
      traceShutdown('vkToken', ctx.vkToken?.close()),
      traceShutdown('runnerSessions', ctx.runnerSessions?.close()),
      traceShutdown('forms', ctx.forms?.stop()),
      traceShutdown('vacancies', ctx.vacancies?.stop()),
      experienceDone,
      traceShutdown('answerModel', ctx.answerModel?.stop?.()),
      traceShutdown('telegramLogins', closeTelegramLogins(ctx)),
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
