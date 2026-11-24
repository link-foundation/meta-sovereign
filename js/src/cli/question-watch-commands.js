import { ownBrowserCommand } from './question-browser-foreground.js';
import { newBrowserWatchId } from '../automation/question-browser-watch.js';

/** Foreground ownership: Ctrl+C/termination waits for the current action to settle. */
export const questionWatchCommand = async (
  args,
  browser,
  progress = () => {}
) => {
  if (
    args['notice-replies'] !== undefined &&
    ![true, false, 'true', 'false'].includes(args['notice-replies'])
  ) {
    throw new Error('notice-replies must be true or false');
  }
  const id = args['watch-id'] ?? newBrowserWatchId();
  return ownBrowserCommand({
    id,
    progress,
    start: () =>
      browser.watchStart({
        id,
        review: args.id,
        confirm: [true, 'true'].includes(args.confirm),
        ...(args['notice-replies'] === undefined
          ? {}
          : { noticeReplies: [true, 'true'].includes(args['notice-replies']) }),
        ...(args['duration-ms'] === undefined
          ? {}
          : { durationMs: Number(args['duration-ms']) }),
      }),
    status: browser.watchStatus,
    stop: browser.watchStop,
  });
};
