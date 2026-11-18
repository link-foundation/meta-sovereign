import { setTimeout as delay } from 'node:timers/promises';
import { assignmentFailure, assignmentVacancyUrl } from './validation.js';

const loading = (value, url) =>
  !value.challenge &&
  assignmentVacancyUrl(value.url) === url &&
  typeof value.title === 'string' &&
  typeof value.description === 'string' &&
  (value.description === '' || value.descriptionHtml !== null) &&
  value.company !== null &&
  value.skills !== null &&
  (value.title === '' || value.description === '');
const debug = (value) => {
  if (process.env.MS_ASSIGNMENT_VACANCY_DEBUG === '1') {
    console.error(value);
  }
};

/** Wait only for missing native content; malformed or foreign evidence is final. */
export const readLoadedVacancy = async (
  session,
  read,
  {
    url,
    signal,
    check = () => signal?.throwIfAborted(),
    trace = debug,
    now = () => globalThis.performance.now(),
    wait = (ms) => delay(ms, undefined, { signal }),
  }
) => {
  const deadline = now() + 20000;
  let reads = 0;
  let waiting = false;
  const checkDeadline = () => {
    if (waiting && now() >= deadline) {
      trace({ event: 'vacancy-content-wait-expired', reads });
      throw assignmentFailure(
        'vacancy-timeout',
        'The intended vacancy title and description did not finish loading.'
      );
    }
  };
  while (true) {
    check();
    checkDeadline();
    const value = await session.commander.evaluate({ fn: read, args: [] });
    reads++;
    check();
    checkDeadline();
    if (!loading(value, url)) {
      if (waiting) {
        trace({ event: 'vacancy-content-wait-finished', reads });
      }
      return value;
    }
    if (!waiting) {
      waiting = true;
      trace({ event: 'vacancy-content-wait-started' });
    }
    const remaining = deadline - now();
    checkDeadline();
    await wait(Math.min(250, remaining));
  }
};
