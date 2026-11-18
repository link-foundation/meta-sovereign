import { nativeApplicationForm } from '../../js/tests/helpers/application-native-request.mjs';
import { changeApplicationHoldFixture } from './application-hold-dom.mjs';
import { changeResumeVisibilityWarning } from './application-resume-visibility-dom.mjs';

/** Isolated owned browser fixture controls, never product HTTP routes. */
export const applicationHoldControl = (browser) => async (req) => {
  const kind = {
    '/hold-show': 'verification',
    '/hold-dismiss': 'clear',
    '/hold-provider-error': 'validation-error',
    '/hold-resume-visible': 'resume-visible',
    '/hold-resume-collapsed': 'resume-collapsed',
    '/hold-resume-clear': 'resume-clear',
  }[req.url];
  if (!kind && req.url !== '/hold-values') {
    return null;
  }
  const page = nativeApplicationForm(browser);
  if (!page) {
    throw new Error('No owned synthetic application form');
  }
  if (kind && req.method === 'POST') {
    await page.evaluate(
      kind.startsWith('resume-')
        ? changeResumeVisibilityWarning
        : changeApplicationHoldFixture,
      kind.startsWith('resume-') ? kind.slice(7) : kind
    );
  }
  return page.evaluate(() => ({
    experience: document.querySelector('#experience')?.value ?? null,
    header: document.querySelector('#header').value,
    submissions: globalThis.applicationAttempts,
    entries: globalThis.applicationEntries,
  }));
};
