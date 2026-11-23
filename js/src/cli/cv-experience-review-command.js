import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { defaultStoreDir } from '../storage/app-directory.js';
import {
  createExperienceReviewService,
  storedExperienceReviewStatus,
} from '../cv/experience-review-service.js';
import { experienceReviewRunning } from '../cv/experience-review-record.js';
import {
  cliExperienceServices,
  experienceAcquisitionInput,
} from './cv-experience-auto-command.js';
import { foregroundPrivateCvJob } from './private-cv-job-command.js';

const choices = { y: 'save', s: 'skip' };

export const foregroundExperienceReview = async (
  service,
  input,
  {
    foregroundWait: wait,
    stdin = process.stdin,
    notice = (text) => console.error(text),
  } = {}
) => {
  let reader;
  let current;
  let acting;
  let waitingLogin = false;
  let finished = false;
  const leave = () => {
    if (!finished) {
      acting = (acting ?? Promise.resolve()).then(() =>
        service.stop({ requestId: input.requestId })
      );
      acting.catch(() => {});
    }
  };
  const line = (value) => {
    const key = value.trim().toLowerCase();
    if (key === 'q') {
      leave();
    } else if (
      current &&
      Object.hasOwn(choices, key) &&
      (key !== 'y' || current.canSave)
    ) {
      const owned = current;
      current = null;
      acting = service
        .decide({
          requestId: input.requestId,
          key: owned.key,
          nativeRequestId: owned.input.requestId,
          decision: choices[key],
        })
        .catch(() => {
          notice(
            'The decision was not confirmed. Check the current review status.'
          );
        });
    }
  };
  let announced = null;
  try {
    const row = await foregroundPrivateCvJob(service, input, {
      running: experienceReviewRunning,
      wait,
      observe(value) {
        if (value.waitingLogin && !waitingLogin) {
          notice('Sign in in the active experience browser window.');
        }
        waitingLogin = value.waitingLogin;
        if (value.phase !== 'prepared' || value.current.decision) {
          current = null;
          return;
        }
        current = value.current;
        if (announced === current.input.requestId) {
          return;
        }
        announced = current.input.requestId;
        const item = current.key === 'about' ? 'About' : 'position';
        const provider = current.kind.startsWith('hh-')
          ? 'HeadHunter'
          : 'LinkedIn';
        notice(
          current.canSave
            ? `Review the ${item} in the ${provider} window. Type y to Save, s to Skip, or q to leave the draft open.`
            : `Review the ${item} in the ${provider} window. Type s to Skip or q to leave the draft open.`
        );
        if (current.notes?.length) {
          notice(
            'The comparison includes fields that still need manual review.'
          );
        }
        if (!reader) {
          reader = createInterface({ input: stdin, terminal: false });
          reader.on('line', line);
          reader.once('close', leave);
          if (stdin.readableEnded) {
            leave();
          }
        }
      },
    });
    return row;
  } finally {
    finished = true;
    reader?.close();
    await acting;
  }
};

export const createExperienceReviewCommands = (
  { openStore, openReadOnly = openStore },
  options = {}
) =>
  Object.fromEntries(
    ['start', 'status', 'resume', 'stop'].map((operation) => [
      `cv-experience-review-${operation}`,
      async (args, log) => {
        const dir = args.store ?? defaultStoreDir();
        const requestId =
          args['request-id'] ??
          (operation === 'start' ? randomUUID() : undefined);
        const request = { requestId };
        const reading = operation === 'status';
        const store = await (reading ? openReadOnly : openStore)(dir);
        let children;
        let service;
        try {
          let row;
          if (reading) {
            row = await storedExperienceReviewStatus(store, request);
          } else {
            children = cliExperienceServices(store, dir, options);
            service = createExperienceReviewService({
              store,
              ...children,
              wait: options.wait,
            });
            if (operation === 'stop') {
              row = await service.stop(request);
            } else if (operation === 'resume') {
              row = await foregroundExperienceReview(
                { ...service, start: service.resume },
                request,
                options
              );
            } else {
              const autoRequestId = args['auto-request-id'];
              row = await foregroundExperienceReview(
                service,
                autoRequestId
                  ? { ...request, autoRequestId }
                  : experienceAcquisitionInput(args, requestId),
                options
              );
            }
          }
          log(JSON.stringify(row, null, 2));
          return ['start', 'resume'].includes(operation) &&
            row.phase !== 'completed'
            ? 1
            : 0;
        } finally {
          try {
            await service?.close();
            await children?.close();
          } finally {
            await store.close?.();
          }
        }
      },
    ])
  );
