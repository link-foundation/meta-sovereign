import { setTimeout as delay } from 'node:timers/promises';
import { newBrowserWatchId } from '../automation/question-browser-watch.js';

/** Foreground ownership: Ctrl+C/termination waits for the current action to settle. */
export const questionWatchCommand = async (
  args,
  browser,
  progress = () => {}
) => {
  const id = args['watch-id'] ?? newBrowserWatchId();
  let cancelled = false;
  const cancel = () => {
    cancelled = true;
  };
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  let started = false;
  try {
    let status = await browser.watchStart({
      id,
      review: args.id,
      confirm: [true, 'true'].includes(args.confirm),
      ...(args['duration-ms'] === undefined
        ? {}
        : { durationMs: Number(args['duration-ms']) }),
    });
    started = true;
    progress(status);
    while (!cancelled && status.owned && status.state === 'active') {
      await delay(250);
      status = await browser.watchStatus({ id });
    }
    return cancelled ? await browser.watchStop({ id }) : status;
  } finally {
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
    if (started) {
      await browser.watchStop({ id });
    }
  }
};
