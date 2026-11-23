import { createInterface } from 'node:readline';
import { linkedinPositionRunning } from '../cv/linkedin-position-job.js';
import { foregroundPrivateCvJob } from './private-cv-job-command.js';

export const foregroundLinkedinPosition = async (
  service,
  input,
  { wait, stdin = process.stdin, notice = (text) => console.error(text) } = {}
) => {
  let reader;
  let action;
  let problem;
  let finished = false;
  const stop = () => service.stop({ requestId: input.requestId });
  const choose = (decision) => {
    if (action || finished) {
      return;
    }
    action = Promise.resolve()
      .then(() =>
        decision === 'leave' ? stop() : service.decide({ ...input, decision })
      )
      .catch(async (error) => {
        problem = error;
        await stop();
      });
    action.catch(() => {});
  };
  try {
    const row = await foregroundPrivateCvJob(service, input, {
      running: linkedinPositionRunning,
      wait,
      observe: (value) => {
        if (value.phase !== 'prepared' || reader) {
          return;
        }
        notice(
          'Review the position in the LinkedIn window. Type y to Save, s to Skip, or q to leave the draft open.'
        );
        if (value.unapplied.length) {
          notice(`Manual review required for ${value.unapplied.join(', ')}.`);
        }
        reader = createInterface({ input: stdin, terminal: false });
        reader.on('line', (line) => {
          const choices = { y: 'save', s: 'skip', q: 'leave' };
          const key = line.trim().toLowerCase();
          if (Object.hasOwn(choices, key)) {
            choose(choices[key]);
          }
        });
        reader.once('close', () => choose('leave'));
      },
    });
    await action;
    if (problem && row.phase !== 'saved') {
      throw problem;
    }
    return row;
  } finally {
    finished = true;
    reader?.close();
    await action;
  }
};
