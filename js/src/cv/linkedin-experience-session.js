import { linkedinExperienceGate } from './linkedin-experience-dom.js';
import { linkedinExportFailure } from './linkedin-experience-record.js';

export const evaluateLinkedin = (session, fn, args = []) =>
  session.commander.evaluate({ fn, args });

/** Cookie values never leave the browser predicate or enter logs/evidence. */
export const linkedinSessionGate = async (session, url, check) => {
  check();
  const gate = await evaluateLinkedin(session, linkedinExperienceGate);
  check();
  if (gate.draft && !gate.wall) {
    throw linkedinExportFailure('draft');
  }
  const signedIn = (
    await session.page.context().cookies('https://www.linkedin.com')
  ).some((cookie) => cookie.name === 'li_at');
  check();
  return {
    ready: signedIn && !gate.wall && gate.ready && gate.url === url,
    gate,
  };
};
