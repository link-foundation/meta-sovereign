import React from 'react';
import { renderToString } from 'react-dom/server';
import { build } from 'esbuild';
import { makeBrowserCommander } from 'browser-commander';
import { NativeCvAbout } from './cv-prepare-native.mjs';
import { cvPrepareFixture } from './cv-prepare-fixture.mjs';
import { cvWatchSavedHtml } from './cv-watch-browser-fixture.mjs';
import { vacancyBrowserFixture } from './vacancy-browser-fixture.mjs';
import { seedHhAboutExperience } from './cv-hh-about-fixture.mjs';
import { prepareNativeCvAbout } from '../../js/src/jobs/cv-prepare-browser.js';
import { verifyOwnerCvSave } from '../../js/src/jobs/cv-save-cycle.js';

let bundle;
export const cvPrepareBrowserFixture = async (
  browser,
  { flush, reviewAbout = false } = {}
) => {
  const data = await cvPrepareFixture();
  bundle ??= build({
    stdin: {
      contents:
        "import React from 'react';import{hydrateRoot}from'react-dom/client';import{NativeCvAbout}from'./experiments/issue-56/cv-prepare-native.mjs';setTimeout(()=>{hydrateRoot(document.getElementById('root'),React.createElement(NativeCvAbout,globalThis.fixtureProps));globalThis.fixtureHydrated=true;},globalThis.fixtureDelay);",
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    minify: true,
    define: { 'process.env.NODE_ENV': '"production"' },
  }).then((result) => result.outputFiles[0].text);
  const script = await bundle;
  const change = data.review.report.changes.find(
    (row) => row.id === 'en:about'
  );
  const native = await browser.newContext();
  const provider = await native.newPage();
  let options = {};
  let app;
  let about;
  const counters = { attached: 0, detached: 0, navigations: 0 };
  await native.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== 'https://hh.ru') {
      return route.abort('blockedbyclient');
    }
    if (url.pathname === '/fixture.js') {
      return route.fulfill({
        contentType: 'application/javascript',
        body: script,
      });
    }
    if (url.pathname === '/resume_converter/resume.txt') {
      const about = await provider.evaluate(() => globalThis.fixtureSavedAbout);
      return route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: cvWatchSavedHtml(about ?? options.about ?? change.before),
      });
    }
    counters.navigations++;
    const props = {
      about: options.about ?? change.before,
      initialOpen: options.initialOpen ?? false,
      maxLength: options.maxLength ?? 24000,
      stealFocus: options.stealFocus ?? false,
    };
    return route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><html lang="en"><head><style>body{font:18px system-ui;margin:32px;max-width:850px}textarea{display:block;width:95%;min-height:440px;margin:16px 0}button{margin:8px;padding:12px}</style></head><body><div id="root">${renderToString(React.createElement(NativeCvAbout, props))}</div><script>globalThis.fixtureProps=${JSON.stringify(props).replaceAll('<', '\\u003c')};globalThis.fixtureDelay=${options.delay ?? 100};globalThis.fixtureInputs=0;globalThis.fixtureSaves=0;globalThis.fixtureOpeners=0;globalThis.fixtureCancels=0;</script><script src="/fixture.js"></script></body></html>`,
    });
  });
  const open = async (next = {}) => {
    options = next;
    await provider.goto(`https://hh.ru/resume/${next.hash ?? change.hash}`);
  };
  try {
    await open();
    const attach = async () => {
      counters.attached++;
      const commander = makeBrowserCommander({
        page: provider,
        enableNetworkTracking: false,
        enableNavigationManager: false,
        enableDialogManager: false,
      });
      return {
        page: provider,
        commander,
        detach: async () => {
          counters.detached++;
          await commander.destroy();
        },
      };
    };
    app = await vacancyBrowserFixture(browser, {
      ...(reviewAbout && {
        cv: {
          experience: {
            hhWorkplace: {
              browser: async ({ run, signal, sourceSlot, hash }) => {
                counters.sourceSlot = sourceSlot;
                const session = await attach();
                try {
                  const check = () => signal.throwIfAborted();
                  assertProviderHash(provider, hash);
                  return await run(session, check);
                } finally {
                  await session.detach();
                }
              },
              prepareAbout: (input) =>
                prepareNativeCvAbout({ ...input, settleMs: 100 }),
              verify: (input) =>
                verifyOwnerCvSave({
                  ...input,
                  pollMs: 50,
                  verificationMs: 1500,
                }),
            },
          },
        },
      }),
      exports: {
        service: ({ store }) => {
          if (flush) {
            store.flush = flush;
          }
          return {
            artifactRoot: data.artifactRoot,
            cvPrepare: { attach },
            cvWatch: {
              attach,
              verification: { pollMs: 50, verificationMs: 1500 },
            },
          };
        },
      },
    });
    for (const row of data.rows) {
      await app.store.put(row);
    }
    if (reviewAbout) {
      about = await seedHhAboutExperience({
        ...data,
        store: app.store,
      });
      await open({ about: about.before, hash: about.identity.hash });
    }
    return {
      ...app,
      data,
      provider,
      change,
      counters,
      about,
      open,
      close: async () => {
        await app.close();
        await native.close();
        await data.close();
      },
    };
  } catch (error) {
    await app?.close();
    await native.close();
    await data.close();
    throw error;
  }
};

const assertProviderHash = (page, hash) => {
  if (new URL(page.url()).pathname !== `/resume/${hash}`) {
    throw new Error('The fixture browser is on a different resume.');
  }
};
