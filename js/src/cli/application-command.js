import { createInterface } from 'node:readline';
import { readFile, stat } from 'node:fs/promises';
import { createVacancyService } from '../jobs/service.js';
import {
  applicationSettings,
  applicationKey,
} from '../jobs/application-options.js';
import { defaultStoreDir } from '../storage/app-directory.js';
import { encodeWire, decodeWire } from '../transport/lino.js';
import { applicationModeSignals } from './application-signals.js';
import { applicationSurveyConfiguration } from './application-configuration.js';
import {
  applicationBatchCommand,
  applicationBatchFile,
} from './application-batch-command.js';

export { APPLICATION_HELP } from './help.js';
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
const commandInput = async (args, configuration) => {
  const standardLetters =
    args['standard-letter-en-file'] || args['standard-letter-ru-file']
      ? {
          en: await letterFile(args['standard-letter-en-file']),
          ru: await letterFile(args['standard-letter-ru-file']),
        }
      : undefined;
  const input = {
    url: args.url,
    ...(args['form-url'] === undefined ? {} : { formUrl: args['form-url'] }),
    requestId: args['request-id'],
    browserSlot: args['browser-slot'],
    headless: boolean(args, 'headless'),
    autoExact: boolean(args, 'auto-exact'),
    testMode: boolean(args, 'test-mode'),
    collectVacancies:
      args['no-collect-vacancies'] === undefined
        ? undefined
        : !boolean(args, 'no-collect-vacancies'),
    supervised: boolean(args, 'supervised'),
    confirmations:
      args.confirm === undefined
        ? undefined
        : args.confirm === 'none'
          ? []
          : typeof args.confirm === 'string'
            ? args.confirm.split(',')
            : [args.confirm],
    recover: boolean(args, 'recover'),
    coverLetter: await letterFile(args['cover-letter-file']),
    standardLetters,
    profileId: args['profile-id'],
    salary: args.salary ? decodeWire(args.salary) : undefined,
    salaryLadder:
      args['no-salary-ladder'] === undefined
        ? undefined
        : !boolean(args, 'no-salary-ladder'),
    salaryFloorRub:
      args['salary-floor-rub'] === undefined
        ? undefined
        : Number(args['salary-floor-rub']),
    autoSelectResumeLanguage:
      boolean(args, 'no-auto-select-resume-language') !== true,
    autoAnswerViewedVacancy: await applicationSurveyConfiguration(
      args,
      configuration
    ),
    reviewDelayMs:
      args['review-delay-ms'] === undefined
        ? undefined
        : Number(args['review-delay-ms']),
    applicationIntervalSeconds:
      args['job-application-interval'] === undefined
        ? undefined
        : Number(args['job-application-interval']),
  };
  applicationSettings(input);
  return input;
};
const commands = {
  read: ['read', {}],
  continue: ['continue', {}],
  'confirm-answers': ['continue', { step: 'answers', confirm: true }],
  'confirm-letter': ['continue', { step: 'cover-letter', confirm: true }],
  'confirm-send': ['continue', { step: 'send', confirm: true }],
  'confirm-popup': ['continue', { step: 'popup', confirm: true }],
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
  'wait-limit-restore': [
    'wait',
    { action: 'start', confirm: true, restoreDraft: true },
  ],
  'stop-limit-wait': ['wait', { action: 'stop' }],
  'resume-menu': ['resume', { action: 'menu', confirm: true }],
  'context-resume': ['resume', { action: 'context', confirm: true }],
  defer: ['defer', { confirm: true }],
  'defer-questions': ['defer-questions', { confirm: true }],
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
        note: 'Continue follows independently saved --confirm=answers,cover-letter,send,popup choices; --confirm=none selects no pauses, and absence defaults to send for questionnaires. It fills only exact saved answers into empty controls, waits for missing answers and requires the displayed confirm-* command for a selected step. A confirmation applies only to that step and revision. The exact-answer send exception requires this continuation to have filled the empty questionnaire itself on this document, and auto-exact enabled. Supervised review requires every step and disables that exception. Status/recovery never continue. An optional --job-application-interval=0 uses adaptive 1–4 minute spacing between opened vacancy reviews; a positive value uses fixed seconds (up to 86400). Queue reports the saved workspace deadline and native outcome counts. If a new review is refused with jobs-application-pace-wait, read queue after its deadline and start again; this single-review command does not run a batch or send on expiry. Existing review recovery does not restart the interval. Entry can immediately apply. Prefill may apply after your exact-answer delay if auto-exact is enabled. Backup saves actual answers privately. Defer saves the full recovery draft, actual Q&A observations and eligible unapproved knowledge before closing; failed saves leave the form open. Generic native errors also save actual answers before closing, then wait five hours in this worker queue. Earlier reopening is refused and search shows the temporary exclusion. Use queue and retry for a due, confirmed fresh review; restoration and sending remain separate. Defer-questions saves unanswered questions as a durable policy with vacancy associations after preserving actual answers. Use vacancies-questions-stored and vacancies-question-change to review, change or remove policies. Until-answered releases associated vacancies for fresh review when an eligible shared answer is available; always also matches answered questions. Matching policy changes preserve and close waiting forms. Recovery copies never act as persistent exclusions. Reopen only reads the saved review; reenter separately confirms a new entry backed by an acknowledged unsent popup. It may apply immediately. Unknown entry or send outcomes without that checkpoint stay reserved. Failed dispatch history stays private and acknowledged; a lost or uncertain outcome without fresh native rejection evidence remains reserved. Restore requires matching empty controls and never sends or learns answers. Supervised review disables automatic sending: use answers and letter for separately confirmed fills, then submit; this command stops after one HH-confirmed delivery. It also stops if entry itself confirms delivery. Test mode never clicks or fills, including during supervised review. Pause and questionnaire policies last for this worker and browser slot. Questionnaire deferral and SIGUSR1 automatically save actual answers before closing; failed saves, pauses and preview keep forms open. SIGUSR2 or review-questionnaires enables a later confirmed queue review without sending. Visible HH daily-limit refusals pause all application slots in this workspace for two hours, with an acknowledged deadline across restarts. Queue and status expose the deadline, workspace scope and whether it was saved. Repeated checks and banner dismissal cannot extend or bypass the pause; reading and chats continue. An unsaved pause remains effective only in this worker, so keep it and the refused form open and read again. Expiry alone never clears native holds or unknown delivery reservations. Use wait-limit to confirm finite waiting with ongoing actual-answer backups and one guarded refresh of a still-failed form at the saved deadline. stop-limit-wait stops and drains the wait without closing. Use wait-limit-restore to separately confirm restoration after that single guarded refresh into matching empty controls; ordinary wait-limit leaves restoration for later. A saved native daily-limit rejection witnessed after this worker issued a confirmed dispatch permits restoration to release only that failed reservation, after expiry and a verified fresh form. Ordinary waiting can be followed by restore. Sending always requires its own confirmation; unknown delivery without that evidence stays reserved. Status and worker restart never resume waiting. Validation, limits and verification retain a manual hold through banner dismissal and browser reopening in this worker. Confirmed delivery clears holds. End of input closes this browser.',
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
  applicationConfiguration,
  applicationInput = () =>
    createInterface({ input: process.stdin, terminal: false }),
  ...options
}) =>
  Object.fromEntries(
    [
      'application',
      'application-status',
      'application-batch',
      'application-batch-status',
    ].map((operation) => [
      `vacancies-${operation}`,
      async (args, log) => {
        if (
          operation !== 'application-batch' &&
          [
            'process-chats',
            'chats-interval-minutes',
            'chat-browser-slot',
            'chat-model-draft',
          ].some((name) => args[name] !== undefined)
        ) {
          throw new Error(
            'Chat worker settings require vacancies application-batch.'
          );
        }
        const urls =
          operation === 'application-batch'
            ? await applicationBatchFile(args['vacancies-file'])
            : undefined;
        const input = urls
          ? {
              ...(await commandInput(
                { ...args, url: urls[0] },
                applicationConfiguration
              )),
              urls,
              maxApplications:
                args['max-applications'] === undefined
                  ? 0
                  : Number(args['max-applications']),
              durationMs:
                args['duration-ms'] === undefined
                  ? undefined
                  : Number(args['duration-ms']),
              noQuestionnaires: boolean(args, 'no-questions'),
              processChats: boolean(args, 'process-chats'),
              chatModelDraft: boolean(args, 'chat-model-draft'),
              chatBrowserSlot: args['chat-browser-slot'],
              chatsIntervalMinutes:
                args['chats-interval-minutes'] === undefined
                  ? undefined
                  : Number(args['chats-interval-minutes']),
            }
          : operation === 'application-batch-status'
            ? {
                requestId: args['request-id'],
                browserSlot: args['browser-slot'],
              }
            : operation === 'application'
              ? await commandInput(args, applicationConfiguration)
              : {
                  ...applicationKey({
                    url: args.url,
                    browserSlot: args['browser-slot'],
                  }),
                  requestId: args['request-id'],
                };
        const storeDir = args.store ?? defaultStoreDir();
        const store = await openStore(storeDir);
        const service = createVacancyService({
          store,
          storeDir,
          ...options,
          application: {
            ...options.application,
            chatLog: (entry) => log(encodeWire(entry)),
          },
        });
        try {
          if (operation === 'application-batch') {
            return await applicationBatchCommand(
              service,
              input,
              log,
              applicationInput
            );
          }
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
