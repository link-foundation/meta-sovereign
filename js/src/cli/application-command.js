import { createInterface } from 'node:readline';
import { readFile, stat } from 'node:fs/promises';
import { createVacancyService } from '../jobs/service.js';
import {
  applicationSettings,
  applicationKey,
} from '../jobs/application-options.js';
import { defaultStoreDir } from '../storage/app-directory.js';
import { encodeWire } from '../transport/lino.js';
import { applicationModeSignals } from './application-signals.js';

export const APPLICATION_HELP = `  vacancies-application --url=<hh-vacancy-url> --request-id=<id> [--cover-letter-file=<text-file>] [--standard-letter-en-file=<text-file> --standard-letter-ru-file=<text-file>] [--no-auto-select-resume-language=true|false] [--supervised=true|false] [--auto-exact=true|false] [--review-delay-ms=3000] [--test-mode=true|false] [--recover=true|false] [--browser-slot=jobs] [--headless=true|false] [--store=<dir>]
  vacancies-application-status --url=<hh-vacancy-url> [--request-id=<id>] [--browser-slot=jobs] [--store=<dir>]`;
const boolean = (args, key) => {
  const value = args[key];
  if (value === undefined) {
    return undefined;
  }
  if (![true, false, 'true', 'false'].includes(value)) {
    throw new Error(`--${key} must be true or false`);
  }
  return value === true || value === 'true';
};
const letterFile = async (file) => {
  if (!file) {
    return '';
  }
  const size = await stat(file);
  if (!size.isFile() || size.size > 96000) {
    throw new Error('Use a cover letter up to 24,000 characters.');
  }
  return readFile(file, 'utf8');
};
const commandInput = async (args) => {
  const standardLetters =
    args['standard-letter-en-file'] || args['standard-letter-ru-file']
      ? {
          en: await letterFile(args['standard-letter-en-file']),
          ru: await letterFile(args['standard-letter-ru-file']),
        }
      : undefined;
  const input = {
    url: args.url,
    requestId: args['request-id'],
    browserSlot: args['browser-slot'],
    headless: boolean(args, 'headless'),
    autoExact: boolean(args, 'auto-exact'),
    testMode: boolean(args, 'test-mode'),
    supervised: boolean(args, 'supervised'),
    recover: boolean(args, 'recover'),
    coverLetter: await letterFile(args['cover-letter-file']),
    standardLetters,
    autoSelectResumeLanguage:
      boolean(args, 'no-auto-select-resume-language') !== true,
    reviewDelayMs:
      args['review-delay-ms'] === undefined
        ? undefined
        : Number(args['review-delay-ms']),
  };
  applicationSettings(input);
  return input;
};
const commands = {
  read: ['read', {}],
  form: ['advance', { action: 'form', confirm: true }],
  enter: ['advance', { action: 'enter', confirm: true }],
  reenter: ['advance', { action: 'reenter', confirm: true }],
  submit: ['advance', { action: 'submit', confirm: true }],
  automatic: ['advance', { action: 'submit', confirm: true, automatic: true }],
  prefill: ['prefill', { confirm: true }],
  answers: ['prefill', { part: 'answers', confirm: true }],
  letter: ['prefill', { part: 'cover-letter', confirm: true }],
  backup: ['backup', { confirm: true }],
  restore: ['restore', { confirm: true }],
  'wait-limit': ['wait', { action: 'start', confirm: true }],
  'stop-limit-wait': ['wait', { action: 'stop' }],
  'resume-menu': ['resume', { action: 'menu', confirm: true }],
  'context-resume': ['resume', { action: 'context', confirm: true }],
  defer: ['defer', { confirm: true }],
  reopen: ['open', { recover: true }],
  pause: ['mode', { paused: true }],
  resume: ['mode', { paused: false }],
  'defer-questionnaires': ['mode', { noQuestionnaires: true }],
  'review-questionnaires': ['mode', { noQuestionnaires: false }],
  close: ['close', {}],
};
const promptCommand = (value) => {
  const match = /^choose-resume ([a-zA-Z0-9_-]{1,100})$/u.exec(value);
  return match
    ? ['resume', { action: 'choose', resume: match[1], confirm: true }]
    : commands[value];
};
const supervisedComplete = (receipt) =>
  receipt.supervised && receipt.delivery === 'provider-confirmed';
const waitInput = (command, receipt) =>
  command[0] === 'wait'
    ? {
        waitId:
          command[1].action === 'start'
            ? globalThis.crypto.randomUUID()
            : receipt.limitWait?.id,
      }
    : {};
export const applicationCommand = async (service, input, log, readInput) => {
  const stream = readInput();
  let cancelled = false;
  let cancelling;
  const cancel = () => {
    cancelled = true;
    stream.close?.();
    cancelling ??= service.cancel();
    cancelling.catch(() => {});
  };
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  const releaseModes = applicationModeSignals(service, input, log);
  try {
    let receipt = await service['application-open'](input);
    log(encodeWire(receipt));
    log(
      encodeWire({
        commands: [
          ...Object.keys(commands),
          'queue',
          'retry',
          'status',
          'quit',
          'choose-resume <hash>',
        ],
        resumeNote:
          'New reviews select the résumé language from employer questions, dollar pay and the full vacancy description using checked exports. Entry opens the full form before any potentially immediate application control. An already correct CV does not reopen its menu. Explicit choices and later native changes survive recovery and override automatic selection. Use --no-auto-select-resume-language to opt out before starting. Use resume-menu then choose-resume <hash> for an explicit verified choice, or context-resume to confirm a new context choice. Both reviewed standard-letter files follow the selected CV language. A later correction can replace only unchanged system-written standard text; owner letters and answers are preserved. Reading and recovery never choose or fill.',
        note: 'Entry can immediately apply. Prefill may apply after your exact-answer delay if auto-exact is enabled. Backup saves actual answers privately. Defer saves the full recovery draft, actual Q&A observations and eligible unapproved knowledge before closing; failed saves leave the form open. Generic native errors also save actual answers before closing, then wait five hours in this worker queue. Earlier reopening is refused and search shows the temporary exclusion. Use queue and retry for a due, confirmed fresh review; restoration and sending remain separate. Recovery copies never act as persistent exclusions. Reopen only reads the saved review; reenter separately confirms a new entry backed by an acknowledged unsent popup. It may apply immediately. Unknown entry or send outcomes without that checkpoint stay reserved. Failed dispatch history stays private and acknowledged; a lost or uncertain outcome without fresh native rejection evidence remains reserved. Restore requires matching empty controls and never sends or learns answers. Supervised review disables automatic sending: use answers and letter for separately confirmed fills, then submit; this command stops after one HH-confirmed delivery. It also stops if entry itself confirms delivery. Test mode never clicks or fills, including during supervised review. Pause and questionnaire policies last for this worker and browser slot. Questionnaire deferral and SIGUSR1 automatically save actual answers before closing; failed saves, pauses and preview keep forms open. SIGUSR2 or review-questionnaires enables a later confirmed queue review without sending. Visible HH daily-limit refusals pause all application slots in this workspace for two hours, with an acknowledged deadline across restarts. Queue and status expose the deadline, workspace scope and whether it was saved. Repeated checks and banner dismissal cannot extend or bypass the pause; reading and chats continue. An unsaved pause remains effective only in this worker, so keep it and the refused form open and read again. Expiry alone never clears native holds or unknown delivery reservations. Use wait-limit to confirm finite waiting with ongoing actual-answer backups and one guarded refresh of a still-failed form at the saved deadline. stop-limit-wait stops and drains the wait without closing. A refreshed form still needs separately confirmed restoration and sending; unknown delivery stays reserved. Status and worker restart never resume waiting. Validation, limits and verification retain a manual hold through banner dismissal and browser reopening in this worker. Confirmed delivery clears holds. End of input closes this browser.',
      })
    );
    if (supervisedComplete(receipt)) {
      return 0;
    }
    for await (const line of stream) {
      const action = line.trim();
      if (cancelled || action === 'quit') {
        break;
      }
      try {
        if (action === 'queue') {
          log(encodeWire(await service['application-queue'](input)));
          continue;
        } else if (action === 'retry') {
          const queue = await service['application-queue'](input);
          const entry = queue.entries.find(
            (row) => row.url === input.url && row.requestId === input.requestId
          );
          receipt = await service['application-retry']({
            ...input,
            queueId: entry?.id,
            confirm: true,
          });
        } else if (action === 'status') {
          receipt = await service['application-status'](input);
        } else {
          const command = promptCommand(action);
          if (!command) {
            throw new Error('Use one of the listed commands.');
          }
          receipt = await service[`application-${command[0]}`]({
            ...input,
            revision: receipt.revision,
            ...command[1],
            ...waitInput(command, receipt),
          });
        }
        log(encodeWire(receipt));
        if (supervisedComplete(receipt)) {
          break;
        }
      } catch (error) {
        log(
          encodeWire({
            ok: false,
            code: error.code ?? 'jobs-application-command',
          })
        );
      }
    }
    return cancelled ? 130 : 0;
  } finally {
    process.off('SIGINT', cancel);
    process.off('SIGTERM', cancel);
    releaseModes();
    stream.close?.();
    await cancelling;
  }
};
export const createApplicationCommands = ({
  openStore,
  applicationInput = () =>
    createInterface({ input: process.stdin, terminal: false }),
  ...options
}) =>
  Object.fromEntries(
    ['application', 'application-status'].map((operation) => [
      `vacancies-${operation}`,
      async (args, log) => {
        const input =
          operation === 'application'
            ? await commandInput(args)
            : {
                ...applicationKey({
                  url: args.url,
                  browserSlot: args['browser-slot'],
                }),
                requestId: args['request-id'],
              };
        const storeDir = args.store ?? defaultStoreDir();
        const store = await openStore(storeDir);
        const service = createVacancyService({ store, storeDir, ...options });
        try {
          if (operation === 'application') {
            return await applicationCommand(
              service,
              input,
              log,
              applicationInput
            );
          }
          log(encodeWire(await service[operation](input)));
          return 0;
        } finally {
          try {
            await service.stop();
          } finally {
            await store.close?.();
          }
        }
      },
    ])
  );
