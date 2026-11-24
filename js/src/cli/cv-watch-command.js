import { setTimeout as delay } from 'node:timers/promises';
import { encodeWire } from '../transport/lino.js';

/** Foreground CLI owns a finite watch; exit always drains and disconnects. */
export const foregroundCvWatch = async (service, input, log) => {
  let result = await service['cv-watch'](input);
  log(encodeWire(result));
  let stopped = false;
  const stop = () => {
    stopped = true;
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  try {
    while (result.watch.active) {
      if (stopped) {
        return await service['cv-watch-stop'](input);
      }
      await delay(250);
      result = await service['cv-watch-status'](input);
    }
    return result;
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }
};
