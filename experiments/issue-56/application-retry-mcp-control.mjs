import { rejectNativeApplication } from './application-retry-dom.mjs';
import { applicationRetryMs } from '../../js/src/jobs/application-retries.js';
import { nativeApplicationForm } from '../../js/tests/helpers/application-native-request.mjs';

/** Explicit finite clock/rejection seams on the synthetic fixture server only. */
export const applicationRetryControl = (browser, clock) => async (req) => {
  if (
    !['/retry-reject-next', '/retry-advance', '/retry-stats'].includes(req.url)
  ) {
    return null;
  }
  if (req.method === 'POST') {
    if (req.url === '/retry-advance') {
      clock.value += applicationRetryMs;
    }
    if (req.url === '/retry-reject-next') {
      const page = nativeApplicationForm(browser);
      if (!page) {
        throw new Error('No bound synthetic form for rejection');
      }
      await rejectNativeApplication(page, clock);
    }
  }
  return {
    now: new Date(clock.value).toISOString(),
    rejections: clock.rejections,
  };
};
