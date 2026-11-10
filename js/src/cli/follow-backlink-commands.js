import { createFollowBacklinks } from '../follow/backlinks.js';
import { encodeLinoValue } from '../transport/lino.js';

const flag = (value) => {
  if (value === undefined || value === false || value === 'false') {
    return false;
  }
  if (value === true || value === 'true') {
    return true;
  }
  throw new Error('Expected true or false');
};
const number = (value) =>
  value === undefined
    ? undefined
    : typeof value === 'number'
      ? value
      : /^\d+$/u.test(value)
        ? Number(value)
        : NaN;
const configOf = (args) => ({
  source: args.source,
  chats: String(args.chats ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  backlink: args.backlink,
  monitorMs: number(args['monitor-ms']),
  intervalMs: number(args['interval-ms']),
  delayMs: number(args['delay-ms']),
  historyLimit: number(args['history-limit']),
  deleteIncoming: flag(args['delete-incoming']),
  retry: {
    attempts: number(args.attempts),
    delayMs: number(args['retry-delay-ms']),
    maxDelayMs: number(args['retry-max-delay-ms']),
  },
});
export const followBacklinkCommands = async ({
  args,
  store,
  log,
  followBacklinks,
}) => {
  const action = args._[2] ?? 'list';
  if (!['post', 'list', 'status', 'resume', 'cancel'].includes(action)) {
    throw new Error(
      'follow backlinks expects post | list | status | resume | cancel'
    );
  }
  const service = followBacklinks ?? createFollowBacklinks({ store });
  let jobId;
  let interrupted = false;
  const cancel = () => {
    interrupted = true;
    if (jobId) {
      service.cancel({ jobId }).catch(() => {});
    }
  };
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  try {
    let result;
    if (action === 'post') {
      result = await service.preview(configOf(args));
      if (flag(args.confirm) && !interrupted) {
        result = await service.apply({ planId: result.planId, confirm: true });
      }
    } else {
      result = await service[action]({
        jobId: args['job-id'],
        confirm: flag(args.confirm),
        limit: number(args.limit),
        offset: number(args.offset),
      });
    }
    if (['post', 'resume'].includes(action) && result.id) {
      jobId = result.id;
      if (interrupted) {
        await service.cancel({ jobId });
      }
      await service.idle();
      result = await service.status({ jobId });
    }
    log(args.json ? JSON.stringify(result, null, 2) : encodeLinoValue(result));
    return interrupted ||
      result.ok === false ||
      (result.status && result.status !== 'confirmed')
      ? 1
      : 0;
  } finally {
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
    await service.stop();
  }
};
