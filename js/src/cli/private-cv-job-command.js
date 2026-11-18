import { setTimeout as delay } from 'node:timers/promises';

/** The foreground process owns its cancellation; a read-only command never takes that ownership. */
export const foregroundPrivateCvJob = async (
  service,
  input,
  { running, wait = () => delay(250), observe = () => {} }
) => {
  let stopping;
  const stop = () => {
    stopping ??= service.stop({ requestId: input.requestId });
    stopping.catch(() => {});
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    let row = await service.start(input);
    while (running(row)) {
      observe(row);
      await wait();
      row = await service.status({ requestId: input.requestId });
    }
    return row;
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    await stopping;
  }
};
