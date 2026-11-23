import React from 'react';
import { renderToString } from 'react-dom/server';
import { build } from 'esbuild';
import { makeBrowserCommander } from 'browser-commander';
import { NativeCvWorkplace } from './cv-prepare-workplace-native.mjs';
import { NativeCvWorkplaceList } from './cv-workplace-list-native.mjs';
import { cvPrepareFixture } from './cv-prepare-fixture.mjs';
import { vacancyBrowserFixture } from './vacancy-browser-fixture.mjs';
import { prepareNativeCvWorkplace } from '../../js/src/jobs/cv-prepare-workplace.js';
import { cvWorkplaceDictionaryRows } from './cv-workplace-fields-fixture.mjs';

let bundle;
const attachProvider = (provider, counters) => async () => {
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

export const cvWorkplacePrepareBrowserFixture = async (
  browser,
  { fieldsMode = false, copyMode = false } = {}
) => {
  const data = await cvPrepareFixture({ selected: ['en:jobs.0.description'] });
  const change = data.review.report.changes.find(
    (row) => row.id === 'en:jobs.0.description'
  );
  const source = data.review.sources.find((row) => row.cv.language === 'en');
  const otherHash = data.review.sources.find((row) => row.cv.language === 'ru')
    .identity.hash;
  bundle ??= build({
    stdin: {
      contents:
        "import React from 'react';import{hydrateRoot}from'react-dom/client';import{NativeCvWorkplace}from'./experiments/issue-56/cv-prepare-workplace-native.mjs';import{NativeCvWorkplaceList}from'./experiments/issue-56/cv-workplace-list-native.mjs';setTimeout(()=>{hydrateRoot(document.getElementById('root'),React.createElement(globalThis.fixtureProps.screen?NativeCvWorkplaceList:NativeCvWorkplace,globalThis.fixtureProps));globalThis.fixtureHydrated=true;},globalThis.fixtureDelay);",
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    minify: true,
    define: { 'process.env.NODE_ENV': '"production"' },
  }).then((result) => result.outputFiles[0].text);
  const script = await bundle;
  const native = await browser.newContext();
  const provider = await native.newPage();
  let options = {};
  let beforeRead;
  let app;
  const counters = {
    attached: 0,
    detached: 0,
    reads: 0,
    navigations: 0,
    saves: 0,
    destinations: [],
  };
  const props = (saved = false) => ({
    job: { ...source.cv.jobs[0], ...(saved ? options.saved : options.live) },
    hash: change.hash,
    otherHash,
    shared: options.shared ?? false,
    maxLength: options.maxLength ?? 24000,
    fieldsMode,
    membershipMode: options.membershipMode ?? false,
  });
  const html = (saved = false, screen) => {
    const value = {
      ...props(saved),
      ...(screen
        ? { screen, list: { allowAdd: copyMode, ...options.list } }
        : {}),
    };
    return `<!doctype html><html lang="en"><head><style>body{font:17px system-ui;margin:24px;max-width:850px}textarea{display:block;width:95%;height:300px;margin:16px 0}input,button{margin:6px;padding:10px}label{display:block}</style></head><body><div id="root">${renderToString(React.createElement(screen ? NativeCvWorkplaceList : NativeCvWorkplace, value))}</div><script>globalThis.fixtureProps=${JSON.stringify(value).replaceAll('<', '\\u003c')};globalThis.fixtureDelay=${options.delay ?? 100};globalThis.fixtureInputs=0;globalThis.fixtureSaves=0;globalThis.fixturePickerSaves=0;globalThis.fixtureCancels=0;</script><script src="/fixture.js"></script></body></html>`;
  };
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
    if (url.pathname === '/fixture/save') {
      counters.saves++;
      return route.fulfill({ body: 'saved fixture' });
    }
    if (route.request().isNavigationRequest()) {
      counters.navigations++;
      counters.destinations.push(url.href);
      const screen =
        url.pathname === '/profile/edit/experience'
          ? 'list'
          : url.pathname.startsWith('/resume/')
            ? 'overview'
            : undefined;
      return route.fulfill({
        contentType: 'text/html',
        body: html(false, screen),
      });
    }
    counters.reads++;
    if (beforeRead) {
      const work = beforeRead;
      beforeRead = null;
      await work();
    }
    return route.fulfill({
      contentType: 'text/html',
      body: options.challenge ? '<input name="captcha">' : html(true),
    });
  });
  const open = async (next = {}) => {
    options = next;
    await provider.goto(
      next.screen === 'overview'
        ? `https://hh.ru/resume/${change.hash}`
        : next.screen === 'list'
          ? `https://hh.ru/profile/edit/experience?resumeFrom=${change.hash}&hhtmFrom=resume`
          : `https://hh.ru/profile/edit/experience/${next.recordId ?? '123'}${next.context ? `?resumeFrom=${change.hash}&hhtmFrom=resume` : ''}`
    );
    await provider.evaluate(() => {
      globalThis.sessionStorage.fixtureListClicks = '0';
    });
  };
  try {
    await open();
    const attach = attachProvider(provider, counters);
    app = await vacancyBrowserFixture(browser, {
      exports: {
        service: () => ({
          artifactRoot: data.artifactRoot,
          cvPrepare: {
            attach,
            prepare: (input) =>
              prepareNativeCvWorkplace({
                ...input,
                readinessMs: 2000,
                settleMs: 50,
              }),
          },
        }),
      },
    });
    for (const row of [...data.rows, ...cvWorkplaceDictionaryRows()]) {
      await app.store.put(row);
    }
    return {
      ...app,
      data,
      provider,
      change,
      counters,
      open,
      beforeRead: (work) => {
        beforeRead = work;
      },
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
