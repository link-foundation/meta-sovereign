import { linkedinExportFailure } from './linkedin-experience-record.js';
import { linkedinExperienceGate } from './linkedin-experience-dom.js';
import { linkedinSessionGate } from './linkedin-experience-session.js';
import { scanLinkedinProfileAbout } from './linkedin-profile-dom.js';

const profileReady = async ({ original, session, options, check }, url) => {
  const source = await linkedinSessionGate(original, options.url, check);
  const profile = await linkedinSessionGate(session, url, check);
  if (!source.ready || profile.gate.wall || profile.gate.url !== url) {
    throw linkedinExportFailure('session');
  }
  return profile.ready;
};
const profileScan = async (context, url) => {
  const { session, options, check, now, wait } = context;
  let stable = 0;
  let previous = '';
  const deadline = now() + 60000;
  for (let pass = 0; pass < 30 && now() < deadline; pass++) {
    if (!(await profileReady(context, url))) {
      await wait(1000, options.signal);
      check();
      continue;
    }
    const raw = await session.page.evaluate(scanLinkedinProfileAbout, {
      url,
      expand: true,
      scroll: true,
    });
    check();
    if (raw.blocked || raw.url !== url) {
      throw linkedinExportFailure('about-markup');
    }
    const signature = JSON.stringify([raw.observed, raw.about]);
    stable =
      !raw.busy &&
      !raw.more &&
      (raw.observed || raw.bottom) &&
      signature === previous
        ? stable + 1
        : 0;
    if (stable >= 2) {
      return {
        url,
        observed: raw.observed,
        ...(raw.observed ? { about: raw.about } : { reason: raw.reason }),
        boundary: raw.observed ? 'rendered-about-section' : 'rendered-bottom',
        passes: pass + 1,
      };
    }
    previous = signature;
    await wait(1000, options.signal);
    check();
  }
  throw linkedinExportFailure('about-incomplete');
};

/** One owned tab; the experience page and every pre-existing tab remain in place. */
export const readLinkedinProfileAbout = async (context) => {
  const { session: original, options, check } = context;
  if (!(await linkedinSessionGate(original, options.url, check)).ready) {
    throw linkedinExportFailure('session');
  }
  const url = options.url.replace(/details\/experience\/$/u, '');
  const page = await original.page.context().newPage();
  try {
    check();
    page.setDefaultTimeout(10000);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    check();
    const session = {
      page,
      commander: {
        evaluate: ({ fn, args = [] }) => page.evaluate(fn, args[0]),
      },
    };
    return await profileScan({ ...context, original, session }, url);
  } finally {
    // The owner may start an edit even in this temporary tab. Keep that draft open.
    const gate = await page.evaluate(linkedinExperienceGate).catch(() => null);
    if (gate && (!gate.draft || gate.wall)) {
      await page.close();
    }
  }
};
