import { join } from 'node:path';
import { makeBrowserCommander } from 'browser-commander';
import { createLinkedinExperienceReader } from '../../js/src/cv/linkedin-experience-reader.js';
import { createExperiencePlanningService } from '../../js/src/cv/experience-plan-service.js';
import { experiencePlanRunning } from '../../js/src/cv/experience-plan-record.js';
import { LINO_TEXT } from '../../js/src/transport/lino.js';
import { cvTechnologyFixture } from './cv-technology-fixture.mjs';
import { cvFixtureRequest } from './cv-fixture-server.mjs';
import { vacancyBrowserFixture } from './vacancy-browser-fixture.mjs';
import { linkedinExportInput } from './linkedin-experience-fixture.mjs';

const initial = 'Original biography.\nExisting skills stay in place.';
const profile = linkedinExportInput().url.replace(
  /details\/experience\/$/u,
  ''
);
const editor = `${profile}edit/forms/summary/`;
const escape = (text) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const delay = () => new Promise((resolve) => setTimeout(resolve, 25));

const html = (state, editing = false) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
    body{font:16px system-ui;margin:36px}section,dialog{padding:24px;max-width:720px}
    textarea{box-sizing:border-box;width:100%;min-height:215px}
    button{margin:8px;padding:10px}dialog::backdrop{background:#24324b88}
    </style></head><body><main><h1>Fixture Owner</h1>
    <section><div id="about"></div><h2>About</h2>
    ${
      state.hostile
        ? '<a aria-label="Edit about" href="https://elsewhere.test/in/fixture-owner/edit/forms/summary/">Edit</a>'
        : `<a aria-label="Edit about" href="${editor}">Edit</a>`
    }
    <div class="inline-show-more-text">${escape(state.about).replaceAll('\n', '<br>')}</div></section></main>
    ${
      editing
        ? `
    <dialog id="about-dialog"><h2>Edit about</h2><form>
      <label for="summary">About</label><textarea id="summary" maxlength="2600">${escape(state.about)}</textarea>
      <p>Skills · Rust · PostgreSQL</p>
      <button type="button" aria-label="Dismiss">Close</button><button type="submit">Save</button>
    </form></dialog>
    <dialog id="discard-dialog"><h2>Discard changes?</h2><button type="button">Discard</button></dialog>
    <script>
      const about = document.getElementById('about-dialog');
      const discard = document.getElementById('discard-dialog');
      const field = document.getElementById('summary');
      let controlled = field.value;
      const close = () => {
        about.remove();
        discard.remove();
        history.replaceState(null, '', ${JSON.stringify(profile)});
      };
      field.addEventListener('input', () => controlled = field.value);
      about.querySelector('button[type=button]').onclick = () => discard.showModal();
      discard.querySelector('button').onclick = async () => {
        await fetch('/fixture-discard', {method:'POST'});
        close();
      };
      about.querySelector('form').onsubmit = async (event) => {
        event.preventDefault();
        await fetch('/fixture-save', {method:'POST',body:controlled});
        close();
      };
      about.showModal();
    </script>`
        : ''
    }</body></html>`;

const attach = async (provider, state) => {
  state.attached++;
  const commander = makeBrowserCommander({
    page: provider,
    enableNetworkTracking: false,
    enableNavigationManager: false,
    enableDialogManager: false,
  });
  return {
    page: provider,
    commander: {
      evaluate: commander.evaluate,
      goto: (options) =>
        commander.goto({
          ...options,
          waitForStableUrlBefore: false,
          waitForStableUrlAfter: false,
          waitForNetworkIdle: false,
        }),
    },
    detach: async () => {
      state.detached++;
      await commander.destroy();
    },
  };
};

export const linkedinAboutBrowserFixture = async (browser) => {
  const hh = await cvTechnologyFixture({ emptyWorkplaces: 'en' });
  const context = await browser.newContext();
  const state = {
    about: initial,
    editorOpens: 0,
    saves: 0,
    discards: 0,
    attached: 0,
    detached: 0,
    stale: false,
    hostile: false,
  };
  const source = hh.sources.find(({ cv }) => cv.language === 'en');
  const provider = await context.newPage();
  const readerPage = await context.newPage();
  let app;
  try {
    await context.addCookies([
      {
        name: 'li_at',
        value: 'fixture-cookie',
        domain: '.linkedin.com',
        path: '/',
      },
    ]);
    await context.route('**/*', async (route) => {
      const url = route.request().url();
      if (
        url === 'https://www.linkedin.com/fixture-save' &&
        route.request().method() === 'POST'
      ) {
        state.saves++;
        if (!state.stale) {
          state.about = route.request().postData();
        }
        return route.fulfill({ status: 204 });
      }
      if (
        url === 'https://www.linkedin.com/fixture-discard' &&
        route.request().method() === 'POST'
      ) {
        state.discards++;
        return route.fulfill({ status: 204 });
      }
      const experience = url === linkedinExportInput().url;
      if (url !== profile && url !== editor && !experience) {
        return route.abort('blockedbyclient');
      }
      state.editorOpens += Number(url === editor);
      return route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: experience
          ? '<!doctype html><html lang="en"><body><main><h1>Experience</h1><p data-view-name="profile-empty-section">No experience to show</p></main></body></html>'
          : html(state, url === editor),
      });
    });
    const artifactRoot = join(hh.artifactRoot, 'linkedin');
    const profileDir = join(hh.artifactRoot, 'linkedin-profile');
    const shared = { store: hh.store, artifactRoot, profileDir, wait: delay };
    const read = createLinkedinExperienceReader({
      ...shared,
      openSession: () => attach(readerPage, state),
    });
    app = await vacancyBrowserFixture(browser, {
      store: hh.store,
      cv: {
        experience: {
          artifactRoot,
          read,
          about: {
            profileDir,
            wait: delay,
            openSession: () => attach(provider, state),
          },
        },
      },
      exports: { service: () => ({ artifactRoot: hh.artifactRoot }) },
    });
    const type = LINO_TEXT;
    const request = cvFixtureRequest(`${app.base}/api/cv/experience/`, [
      'linkedin-status',
      'linkedin-about-status',
      'review-status',
    ]);
    const input = {
      ...linkedinExportInput('about-comparison-acquire'),
      to: 'linkedin',
      hash: source.identity.hash,
      asOf: '2026-11',
    };
    const acquire = async () => {
      let { row } = await request('linkedin-start', type, input);
      if (row.phase !== 'opening') {
        throw new Error(JSON.stringify(row));
      }
      for (let pass = 0; pass < 160; pass++) {
        ({ row } = await request('linkedin-status', type, input));
        if (row.phase === 'completed') return row;
        if (!['opening', 'waiting-login', 'reading'].includes(row.phase)) {
          throw new Error(JSON.stringify(row));
        }
        await delay();
      }
      throw new Error(
        `Synthetic LinkedIn export did not finish. ${JSON.stringify(row)}`
      );
    };
    const seedPlan = async () => {
      const planning = createExperiencePlanningService({ store: hh.store });
      try {
        const saved = await acquire();
        const { row } = await request('from-hh', type, source.identity);
        const options = {
          requestId: 'linkedin-about-comparison',
          hh: row.revision,
          linkedin: saved.revision,
          to: 'linkedin',
          asOf: input.asOf,
        };
        await planning.start(options);
        for (let pass = 0; pass < 160; pass++) {
          const result = await planning.status(options);
          if (!experiencePlanRunning(result)) return result;
          await delay();
        }
        throw new Error('Synthetic LinkedIn About plan did not finish.');
      } finally {
        await planning.close();
      }
    };
    const plan = await seedPlan();
    return {
      ...app,
      provider,
      state,
      request,
      input,
      plan,
      source,
      initial,
      cli: {
        store: hh.store,
        artifactRoot,
        profileDir,
        openSession: () => attach(provider, state),
        wait: delay,
      },
      close: async () => {
        await app.close();
        await context.close();
        await hh.close();
      },
    };
  } catch (error) {
    await app?.close();
    await context.close();
    await hh.close();
    throw error;
  }
};
