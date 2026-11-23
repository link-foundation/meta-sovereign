import { createInterface } from 'node:readline';
import { linkedinPositionRunning } from '../cv/linkedin-position-job.js';
import { foregroundPrivateCvJob } from './private-cv-job-command.js';

export const foregroundPositionReview = async (
  service,
  input,
  {
    running,
    provider,
    label = 'position',
    awaitingLogin,
    wait,
    stdin = process.stdin,
    notice = (text) => console.error(text),
  }
) => {
  let reader;
  let action;
  let problem;
  let finished = false;
  let shownLogin = false;
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
      running,
      wait,
      observe: (value) => {
        if (value.phase === 'waiting-login' && awaitingLogin && !shownLogin) {
          shownLogin = true;
          notice(awaitingLogin);
        }
        if (value.phase !== 'prepared' || reader) {
          return;
        }
        notice(
          value.canSave === false
            ? `Review the ${label} in the ${provider} window. Type s to Skip or q to leave the draft open.`
            : `Review the ${label} in the ${provider} window. Type y to Save, s to Skip, or q to leave the draft open.`
        );
        if (value.preparedSkills?.length) {
          notice(`Prepared skills: ${value.preparedSkills.join(', ')}.`);
        }
        if (value.unresolvedSkills?.length) {
          notice(
            `Review these skills in ${provider}: ${value.unresolvedSkills.join(', ')}.`
          );
        }
        if (value.preparedMedia) {
          notice(
            `Prepared media: ${value.preparedMedia.title} (${value.preparedMedia.url}).`
          );
        }
        if (value.unapplied?.length) {
          notice(`Manual review required for ${value.unapplied.join(', ')}.`);
        }
        reader = createInterface({ input: stdin, terminal: false });
        reader.on('line', (line) => {
          const choices = { y: 'save', s: 'skip', q: 'leave' };
          const key = line.trim().toLowerCase();
          if (
            Object.hasOwn(choices, key) &&
            (key !== 'y' || value.canSave !== false)
          ) {
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

export const foregroundLinkedinPosition = (service, input, options = {}) =>
  foregroundPositionReview(service, input, {
    ...options,
    provider: 'LinkedIn',
    running: linkedinPositionRunning,
  });
