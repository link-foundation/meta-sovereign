import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { ownBrowserCommand } from './question-browser-foreground.js';
import {
  normalizeUnreadPolling,
  sameUnreadSkip,
  unreadSkipTarget,
} from '../automation/question-unread-polling-state.js';

const pollingFlags = (args) => {
  const fields = [
    ['poll-interval-ms', 'intervalMs'],
    ['poll-duration-ms', 'durationMs'],
    ['poll-retry-max-ms', 'retryMaxMs'],
    ['poll-failures', 'maxFailures'],
  ].filter(([flag]) => args[flag] !== undefined);
  for (const [flag] of fields) {
    if (!/^\d+$/u.test(String(args[flag]))) {
      throw new Error(`${flag} must be an integer`);
    }
  }
  return fields.length
    ? {
        polling: normalizeUnreadPolling(
          Object.fromEntries(
            fields.map(([flag, key]) => [key, Number(args[flag])])
          )
        ),
      }
    : {};
};

/** The CLI owns the finite pass until completion or a drained termination signal. */
export const questionUnreadCommand = async (
  args,
  browser,
  options,
  progress = () => {},
  { stdin = process.stdin, notice = console.error } = {}
) => {
  const modes = {};
  for (const [flag, key] of [
    ['notice-replies', 'noticeReplies'],
    ['answer-chats', 'answerChats'],
    ['review-choices', 'reviewChoices'],
    ['watch-waiting', 'watchWaiting'],
    ['prefill-forms', 'prefillForms'],
  ]) {
    if (args[flag] === undefined) {
      continue;
    }
    if (![true, false, 'true', 'false'].includes(args[flag])) {
      throw new Error(`${flag} must be true or false`);
    }
    modes[key] = [true, 'true'].includes(args[flag]);
  }
  const id = args['pass-id'] ?? `question-unread:${randomUUID()}`;
  const watch = modes.watchWaiting;
  let reader;
  let target;
  let announced;
  let skipping;
  const observe = (current) => {
    target = unreadSkipTarget(current);
    if (!target) {
      return;
    }
    if (!reader) {
      reader = createInterface({ input: stdin, terminal: false });
      reader.on('line', (line) => {
        if (line.trim() !== 's' || !target || skipping) {
          return;
        }
        const request = target;
        skipping = Promise.resolve()
          .then(() => browser.unreadSkip(request))
          .then((status) => {
            if (!sameUnreadSkip(status?.polling?.lastSkip, request)) {
              throw new Error('The provider view could not confirm this skip.');
            }
            notice(`Skipped chat ${request.chat}.`);
          })
          .catch((error) => notice(error.message))
          .finally(() => {
            skipping = null;
          });
      });
    }
    const question = `${target.chat}/${target.questionId}`;
    if (question !== announced) {
      announced = question;
      notice(`Chat ${target.chat} is ready for review. Enter s to skip.`);
    }
  };
  try {
    return await ownBrowserCommand({
      id,
      progress,
      ...(watch ? { observe } : {}),
      start: () =>
        browser.unreadStart({
          ...options,
          source: args.source,
          id,
          confirm: [true, 'true'].includes(args.confirm),
          ...(watch
            ? { polling: {}, answerChats: true, reviewChoices: true }
            : {}),
          ...pollingFlags(args),
          ...modes,
          ...Object.fromEntries(
            [
              ['max-chats', 'maxChats'],
              ['budget-ms', 'budgetMs'],
              ['limit', 'limit'],
              ['max-passes', 'maxPasses'],
              ['wait-ms', 'waitMs'],
              ['end-wait-ms', 'endWaitMs'],
            ]
              .filter(([flag]) => args[flag] !== undefined)
              .map(([flag, key]) => [key, Number(args[flag])])
          ),
        }),
      status: browser.unreadStatus,
      stop: browser.unreadStop,
    });
  } finally {
    target = null;
    reader?.close();
    await skipping;
  }
};
