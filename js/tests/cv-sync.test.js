// Issue #29 / R-V15: the facade reads every platform, persists each
// snapshot as a links-notation link, compares them, and pushes the
// reconciled values back — all of it exercised without a browser by
// injecting a fake commander.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'test-anywhere';

import { createFakeCommander } from './helpers/fake-commander.js';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  BrowserUnavailableError,
  applyFlatChanges,
  browserAvailability,
  compareAllCvs,
  cvFromFlat,
  cvFromLink,
  cvLinkId,
  diffAllCvs,
  flattenCv,
  loadStoredCvs,
  openBrowserSession,
  readAllCvs,
  readCvFrom,
  syncCvAcross,
  updateCvOn,
} from '../src/cv/index.js';

const stateJson = readFileSync(
  fileURLToPath(
    new URL('./fixtures/habr-career-profile-state.json', import.meta.url)
  ),
  'utf8'
);

const SSR = 'script[type="application/json"][data-ssr-state="true"]';

const pages = ({ linkedinHeadline = 'Backend developer' } = {}) => ({
  'https://career.habr.com/anna': {
    nodes: {
      [SSR]: [{ text: stateJson }],
      '.page-title__title': [{ text: 'Анна Буянова' }],
      '.skills-list-show-item--profile': [{ text: 'Ruby on Rails' }],
      body: [{ text: '', html: '<body><main>cv</main></body>' }],
    },
  },
  'https://www.linkedin.com/in/me/': {
    nodes: {
      'main section': [{ text: 'profile' }],
      'main h1': [{ text: 'Анна Буянова' }],
      'main .text-body-medium': [{ text: linkedinHeadline }],
      main: [{ text: '', html: '<main><section>cv</section></main>' }],
      '#about ~ div .inline-show-more-text': [{ text: 'About me' }],
      // Edit affordances of the "intro" and "about" dialogs.
      'button[aria-label*="Edit intro"]': [{ text: 'Edit intro' }],
      '#about ~ div button[aria-label*="Edit"]': [{ text: 'Edit' }],
      'div[role="dialog"] form': [{ text: 'form' }],
      'div[role="dialog"] #single-line-text-form-component-profileEditFormElement-TOPCARD-headline':
        [{ text: '' }],
      'div[role="dialog"] textarea': [{ text: '' }],
      'div[role="dialog"] button[aria-label="Save"]': [{ text: 'Save' }],
      'div[role="dialog"]': [
        { text: '', html: '<div role="dialog"><form>edit</form></div>' },
      ],
    },
  },
  'https://www.linkedin.com/in/me/details/skills/': {
    nodes: {
      'main .pvs-list__paged-list-item .t-bold span[aria-hidden="true"]': [
        { text: 'Kubernetes' },
      ],
    },
  },
  'https://www.linkedin.com/in/me/details/experience/': { nodes: {} },
  'https://www.linkedin.com/in/me/details/education/': { nodes: {} },
});

const vars = { login: 'anna' };

describe('browser session factory', () => {
  it('reports which optional packages are missing instead of throwing', async () => {
    const availability = await browserAvailability({
      importers: {
        'browser-commander': () => Promise.reject(new Error('not installed')),
        playwright: () => Promise.reject(new Error('not installed')),
      },
    });
    expect(availability.available).toBe(false);
    expect(availability.missing).toEqual(['browser-commander', 'playwright']);
    expect(availability.reason).toContain('npm i');
  });

  it('wraps the launched page in a commander and closes both', async () => {
    const closed = [];
    const session = await openBrowserSession({
      platform: 'linkedin',
      importers: {
        'browser-commander': () =>
          Promise.resolve({
            makeBrowserCommander: ({ page }) => ({
              page,
              destroy: () => closed.push('commander'),
            }),
          }),
      },
      launcher: () => ({
        page: { id: 'page' },
        context: { id: 'context' },
        close: () => closed.push('browser'),
      }),
    });
    expect(session.page.id).toBe('page');
    await session.close();
    expect(closed).toEqual(['commander', 'browser']);
  });

  it('fails with a typed error when browser-commander is absent', async () => {
    let error = null;
    try {
      await openBrowserSession({
        importers: {
          'browser-commander': () => Promise.reject(new Error('missing')),
        },
        launcher: () => ({ page: {}, close: () => {} }),
      });
    } catch (caught) {
      error = caught;
    }
    expect(error instanceof BrowserUnavailableError).toBe(true);
    expect(error.code).toBe('browser-unavailable');
    expect(error.missing).toEqual(['browser-commander']);
  });
});

describe('reading CVs through the facade', () => {
  it('reads one platform and persists the snapshot as a link', async () => {
    const store = createMemoryStore();
    const commander = createFakeCommander({ pages: pages() });
    const result = await readCvFrom('habr-career', {
      commander,
      store,
      vars,
    });
    expect(result.platform).toBe('habr-career');
    expect(result.cv.basics.name).toBe('Анна Буянова');
    expect(result.fields).toBeGreaterThan(20);

    const link = await store.get(cvLinkId('habr-career'));
    expect(link.tokens).toEqual(['cv', 'habr-career']);
    expect(link.lino).toContain('habr-career');
    expect(cvFromLink(link).basics.name).toBe('Анна Буянова');

    const [stored] = await loadStoredCvs(store, ['habr-career']);
    expect(stored.cv.skills).toContain('Ruby on Rails');
  });

  it('records the telemetry of every read in the same store', async () => {
    const store = createMemoryStore();
    await readCvFrom('habr-career', {
      commander: createFakeCommander({ pages: pages() }),
      store,
      vars,
    });
    const events = await store.query((link) =>
      link.id.startsWith('cv-telemetry')
    );
    expect(events.length).toBeGreaterThan(0);
    expect(
      events.some((event) => event.event.type === 'markup.fingerprint')
    ).toBe(true);
    // Events are addressable per run and ordered by sequence number.
    expect(events[0].tokens[0]).toBe('cv-telemetry');
  });

  it('keeps going when one platform fails and reports why', async () => {
    const withExpiredSession = pages();
    withExpiredSession['https://www.linkedin.com/in/me/'] = {
      redirectTo: 'https://www.linkedin.com/uas/login',
      nodes: {},
    };
    withExpiredSession['https://www.linkedin.com/uas/login'] = { nodes: {} };
    const { entries, failures } = await readAllCvs(
      ['habr-career', 'linkedin'],
      { commander: createFakeCommander({ pages: withExpiredSession }), vars }
    );
    expect(entries.map((entry) => entry.platform)).toEqual(['habr-career']);
    expect(failures[0].platform).toBe('linkedin');
    expect(failures[0].code).toBe('login-required');
  });
});

describe('comparing CVs across platforms', () => {
  it('builds a matrix, flags conflicts and lists per-platform updates', async () => {
    const commander = createFakeCommander({ pages: pages() });
    const { entries } = await readAllCvs(['habr-career', 'linkedin'], {
      commander,
      vars,
    });
    expect(entries.length).toBe(2);

    const comparison = compareAllCvs(entries, { prefer: 'habr-career' });
    expect(comparison.platforms).toEqual(['habr-career', 'linkedin']);
    const headline = comparison.rows.find(
      (row) => row.path === 'basics.headline'
    );
    expect(headline.conflict).toBe(true);
    expect(
      comparison.updates.linkedin.some((u) => u.path === headline.path)
    ).toBe(true);
    // LinkedIn read Kubernetes, Habr read Ruby on Rails: each platform is
    // told about the skill the other one has.
    expect(
      comparison.updates['habr-career'].some((u) =>
        String(u.value).includes('Kubernetes')
      )
    ).toBe(true);
  });

  it('diffs every platform against a canonical CV', async () => {
    const commander = createFakeCommander({ pages: pages() });
    const { entries } = await readAllCvs(['habr-career', 'linkedin'], {
      commander,
      vars,
    });
    const canonical = entries[0].cv;
    const diffs = diffAllCvs(entries, canonical);
    expect(diffs[0].equal).toBe(true);
    expect(diffs[1].equal).toBe(false);
    expect(diffs[1].patch).toContain('basics.headline');
  });

  it('round-trips a CV through its flat representation', async () => {
    const commander = createFakeCommander({ pages: pages() });
    const { cv } = await readCvFrom('habr-career', { commander, vars });
    expect(cvFromFlat(flattenCv(cv))).toEqual(cv);

    const patched = applyFlatChanges(cv, [
      { path: 'basics.headline', value: 'Staff Engineer' },
      { path: 'skills[kubernetes]', value: 'Kubernetes' },
    ]);
    expect(patched.basics.headline).toBe('Staff Engineer');
    expect(patched.skills).toContain('Kubernetes');
    expect(patched.experience).toEqual(cv.experience);
  });
});

describe('syncing CVs across platforms', () => {
  it('plans without touching anything by default', async () => {
    const commander = createFakeCommander({ pages: pages() });
    const result = await syncCvAcross(['habr-career', 'linkedin'], {
      commander,
      vars,
      prefer: 'habr-career',
    });
    expect(result.dryRun).toBe(true);
    expect(result.applied).toEqual([]);
    expect(commander.calls.fill.length).toBe(0);
    const linkedin = result.actions.find(
      (action) => action.platform === 'linkedin'
    );
    expect(linkedin.pending).toBeGreaterThan(0);
    // LinkedIn cannot write a name, so that difference is reported as
    // unsupported rather than silently dropped.
    expect(linkedin.paths.every((path) => path !== 'basics.name')).toBe(true);
    expect(result.target.basics.name).toBe('Анна Буянова');
  });

  it('applies the reconciled values when the dry run is lifted', async () => {
    const commander = createFakeCommander({ pages: pages() });
    const result = await syncCvAcross(['habr-career', 'linkedin'], {
      commander,
      vars,
      prefer: 'habr-career',
      dryRun: false,
    });
    expect(result.dryRun).toBe(false);
    expect(result.applied.length).toBeGreaterThan(0);
    expect(commander.calls.fill.length).toBeGreaterThan(0);
    const applied = result.applied.find((run) => run.platform === 'linkedin');
    expect(applied.applied).toContain('intro');
    // Habr Career has no skills editor in its plan, so the skill it is
    // missing is reported as unsupported instead of being attempted.
    const habr = result.actions.find(
      (action) => action.platform === 'habr-career'
    );
    expect(habr.writable).toBe(0);
    expect(habr.unsupported).toBe(habr.pending);
  });

  it('fails loudly when a platform hides its edit URLs from us', async () => {
    // The captured Habr Career state is an anonymous visit, so every
    // `edit` field is null. The update must stop at the unresolved URL
    // rather than navigate somewhere unexpected.
    const commander = createFakeCommander({ pages: pages() });
    const { cv } = await readCvFrom('habr-career', { commander, vars });
    let error = null;
    try {
      await updateCvOn('habr-career', cv, {
        commander,
        vars,
        groups: ['about'],
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeTruthy();
    expect(error.message).toContain('editTargets.about');
    expect(commander.calls.fill.length).toBe(0);
  });

  it('pushes a locally edited CV to one platform', async () => {
    const commander = createFakeCommander({ pages: pages() });
    const { cv } = await readCvFrom('habr-career', { commander, vars });
    const edited = applyFlatChanges(cv, [
      { path: 'basics.headline', value: 'Principal Engineer' },
    ]);
    const run = await updateCvOn('linkedin', edited, {
      commander,
      vars,
      groups: ['intro'],
    });
    expect(run.applied).toEqual(['intro']);
    expect(
      commander.calls.fill.some((call) => call.text === 'Principal Engineer')
    ).toBe(true);
  });
});
