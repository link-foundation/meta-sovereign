import { feedbackServiceFor } from './feedback-service.js';

// One provider page per account every thirty seconds, through its prefetch
// queue. Existing message sync discovers chats; this never crawls the web.
export const feedbackWorkerFor = ({ store, ctx, log, later }) => {
  let timer = null;
  let running = false;
  let stopped = false;
  const active = new Set();
  const tick = async () => {
    if (running || stopped) {
      return;
    }
    running = true;
    try {
      const entries = [{ store, ctx }];
      for (let slot = 2; slot <= 5; slot++) {
        const entry = ctx.telegramExtras?.get(slot);
        if (entry) {
          entries.push({
            store: entry.store,
            ctx: {
              chatIndex: entry.chatIndex,
              telegramAccount: entry.account,
              log,
            },
          });
        }
      }
      for (const entry of entries) {
        if (stopped) {
          break;
        }
        const service = feedbackServiceFor(entry.store, entry.ctx);
        active.add(service);
        await service.step();
      }
    } catch (error) {
      log?.({
        level: 'warn',
        event: 'feedback_collection_failed',
        code: error.code ?? 'read-failed',
      });
    } finally {
      running = false;
    }
  };
  later.push(() => {
    timer = globalThis.setInterval(tick, 30_000);
    timer.unref?.();
  });
  return {
    stopFeedback: () => {
      stopped = true;
      globalThis.clearInterval(timer);
      active.forEach((service) => service.close());
    },
  };
};
