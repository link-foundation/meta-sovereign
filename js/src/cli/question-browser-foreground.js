import { setTimeout as delay } from 'node:timers/promises';

/** A foreground command owns its signal handlers until the pending action drains. */
export const ownBrowserCommand = async ({
  id,
  start,
  status,
  stop,
  progress,
}) => {
  let cancelled = false;
  const cancel = () => {
    cancelled = true;
  };
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  let started = false;
  try {
    let current = await start();
    started = true;
    progress(current);
    while (!cancelled && current.owned && current.state === 'active') {
      await delay(250);
      current = await status({ id });
    }
    return cancelled ? await stop({ id }) : current;
  } finally {
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
    if (started) {
      await stop({ id });
    }
  }
};
