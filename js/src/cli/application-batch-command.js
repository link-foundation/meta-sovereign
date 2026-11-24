import { stat, readFile } from 'node:fs/promises';
import { encodeWire } from '../transport/lino.js';
import { applicationModeSignals } from './application-signals.js';

export const applicationBatchFile = async (file) => {
  const info = await stat(file);
  if (!info.isFile() || info.size > 128000) {
    throw new Error('Use a text file with at most 1,000 HH vacancy URLs.');
  }
  return (await readFile(file, 'utf8')).split(/\s+/u).filter(Boolean);
};
const stepCommands = {
  'confirm-answers': 'answers',
  'confirm-letter': 'cover-letter',
  'confirm-send': 'send',
  'confirm-popup': 'popup',
};
const advanceCommands = ['letter-prepare', 'letter-send', 'skip-recruiter'];
const applicationCommands = {
  read: 'application-read',
  'close-review': 'application-close',
  ...Object.fromEntries(
    advanceCommands.map((action) => [action, 'application-advance'])
  ),
};
const modeCommands = {
  pause: { paused: true },
  resume: { paused: false },
  'defer-questionnaires': { noQuestionnaires: true },
  'review-questionnaires': { noQuestionnaires: false },
};
const currentCommand = async (service, action, displayed) => {
  const receipt = displayed.application;
  if (!receipt) {
    throw new Error('No active batch application.');
  }
  return service[applicationCommands[action] ?? 'application-continue']({
    url: receipt.url,
    browserSlot: receipt.browserSlot,
    requestId: receipt.requestId,
    revision: receipt.revision,
    ...(stepCommands[action]
      ? { step: stepCommands[action], confirm: true }
      : {}),
    ...(advanceCommands.includes(action) ? { action, confirm: true } : {}),
    ...(action === 'skip-recruiter'
      ? { recruiterSkipTarget: receipt.recruiterSkipTarget }
      : {}),
  });
};
const batchCommand = async (service, input, action, displayed) => {
  if (action === 's' && displayed.application?.recruiterSkipTarget) {
    action = 'skip-recruiter';
  }
  if (action === 's') {
    const target = displayed.batch?.chatWorker?.skip;
    if (!input.chatWatchWaiting || !target) {
      throw Object.assign(
        new Error('Display the held chat with status before skipping.'),
        {
          code: 'jobs-application-chats-skip-changed',
        }
      );
    }
    const receipt = await service['application-batch-chat-skip']({
      requestId: input.requestId,
      browserSlot: input.browserSlot,
      chatReview: target,
    });
    return { displayed: receipt, output: receipt };
  }
  if (modeCommands[action]) {
    const receipt = await service['application-batch-mode']({
      ...input,
      ...modeCommands[action],
      revision: displayed.batch?.revision,
    });
    return { displayed: receipt, output: receipt };
  }
  if (action === 'status' || action === 'review') {
    const receipt = await service['application-batch-status'](input);
    return { displayed: receipt, output: receipt };
  }
  if (
    action === 'continue' ||
    Object.hasOwn(applicationCommands, action) ||
    Object.hasOwn(stepCommands, action)
  ) {
    const application = await currentCommand(service, action, displayed);
    return { displayed: { ...displayed, application }, output: application };
  }
  throw new Error('Unknown batch command.');
};
export const applicationBatchCommand = async (
  service,
  input,
  log,
  readInput
) => {
  const stream = readInput();
  const identity = {
    requestId: input.requestId,
    browserSlot: input.browserSlot,
  };
  let cancelling;
  const cancel = () => {
    stream.close?.();
    cancelling ??= service['application-batch-stop'](input);
    cancelling.catch(() => {});
  };
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  const release = applicationModeSignals(service, identity, log);
  let done;
  let displayed;
  try {
    displayed = await service['application-batch-start']({
      ...input,
      confirm: true,
    });
    log(encodeWire(displayed));
    done = Promise.resolve(service['application-batch-drain']()).finally(() =>
      stream.close?.()
    );
    done.catch(() => {});
    log(
      encodeWire({
        commands: [
          'status',
          'review',
          'read',
          'continue',
          ...Object.keys(stepCommands),
          ...advanceCommands,
          'close-review',
          'pause',
          'resume',
          'defer-questionnaires',
          'review-questionnaires',
          's',
          'stop',
          'quit',
        ],
        note: 'This finite paced batch may fill and send according to its saved confirmation choices. Confirm commands apply only to the current displayed step and revision. Review/status never resume work. SIGUSR1 defers questionnaires in RAM; SIGUSR2 enables automatic due revisits through the same guards. A backed daily-limit wait may refresh and restore its form before following the saved confirmation choices. Stop drains batch work and leaves the current native form for review. End of input drains the worker and closes its browser.',
        recruiterCommand:
          'Read or display the current application. When it offers a recruiter question to skip, type skip-recruiter or s. The current panel closes without sending a reply.',
        ...(input.chatWatchWaiting
          ? {
              chatCommand:
                'Use status to display the held unread chat. Type s to skip that exact question when no application recruiter question is offered.',
            }
          : {}),
      })
    );
    for await (const line of stream) {
      const action = line.trim();
      if (action === 'quit' || action === 'stop') {
        break;
      }
      try {
        const result = await batchCommand(service, input, action, displayed);
        displayed = result.displayed;
        log(encodeWire(result.output));
      } catch (error) {
        log(
          encodeWire({
            ok: false,
            code: error.code ?? 'jobs-application-batch-command',
          })
        );
      }
    }
  } finally {
    process.off('SIGINT', cancel);
    process.off('SIGTERM', cancel);
    release();
    stream.close?.();
    await (cancelling ?? service['application-batch-stop'](input));
    await done;
  }
  const result = await service['application-batch-status'](input);
  log(encodeWire(result));
  return ['completed', 'stopped'].includes(result.batch?.phase) ? 0 : 1;
};
