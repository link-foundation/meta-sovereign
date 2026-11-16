import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { createMemoryStore } from '../../js/src/storage/index.js';
import { openBrowserSession } from '../../js/src/cv/browser.js';
import { createLinkedinExperienceReader } from '../../js/src/cv/linkedin-experience-reader.js';
import { linkedinExportInput } from './linkedin-experience-fixture.mjs';

const role = (
  title,
  period
) => `<li class="pvs-list__paged-list-item"><div class="pvs-entity">
<div class="t-bold"><span aria-hidden="true">${title}</span><span class="visually-hidden">duplicate</span></div>
<span class="pvs-entity__caption-wrapper"><span aria-hidden="true">${period}</span></span>
<span class="t-14 t-normal"><span aria-hidden="true">London</span></span>
<div class="inline-show-more-text">Built Rust systems.<br>Kept original descriptions.</div>
<ul><li><div class="pvs-entity"><a href="https://www.linkedin.com/skill-associations/Rust/">Skills: Rust</a></div></li>
<li><div class="pvs-entity"><a href="https://example.test/demo">Demo</a></div></li></ul>
</div></li>`;
export const linkedinNativeHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
body{font:16px sans-serif}li{margin:16px}.visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden}
</style></head><body><main><h1>Experience</h1><ul><li class="pvs-list__paged-list-item"><div class="pvs-entity" data-entity-urn="company:fixture">
<div class="t-bold"><span aria-hidden="true">Fixture Company</span></div><ul>
${role('Lead engineer', 'Jan 2023 - Present')}${role('Engineer', '2020 - Dec 2022')}
</ul></div></li></ul><button id="expand">…see more</button><button id="more">Show more results</button></main>
<script>
document.getElementById('expand').onclick = (event) => event.target.remove();
document.getElementById('more').onclick = (event) => {
const list = document.createElement('ul');
list.innerHTML = '<li class="pvs-list__paged-list-item"><div class="pvs-entity"><div class="t-bold">Earlier engineer</div><span class="t-14 t-normal"><span aria-hidden="true">Earlier Company · Full-time</span></span><span class="pvs-entity__caption-wrapper">2018 - 2020</span><div class="inline-show-more-text">Original earlier role.</div></div></li>';
document.querySelector('main').append(list); event.target.remove();
};
</script></body></html>`;

/** Real commander and DOM callbacks; all network is intercepted with synthetic data. */
export const verifyLinkedinNativeExperience = async (browser) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'linkedin-native-browser-'));
  const context = await browser.newContext();
  let loads = 0;
  try {
    await context.addCookies([
      {
        name: 'li_at',
        value: 'synthetic-cookie',
        domain: '.linkedin.com',
        path: '/',
      },
    ]);
    const input = linkedinExportInput('native-browser-read');
    await context.route('**/*', async (route) => {
      assert.equal(route.request().url(), input.url);
      loads++;
      await route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: linkedinNativeHtml,
      });
    });
    const read = createLinkedinExperienceReader({
      store: createMemoryStore(),
      artifactRoot: path.join(dir, 'artifacts'),
      profileDir: path.join(dir, 'profile'),
      wait: async () => {},
      openSession: (options) =>
        openBrowserSession({
          ...options,
          launcher: async () => ({
            page: await context.newPage(),
            close: () => context.close(),
          }),
        }),
    });
    const result = await read(input);
    assert.equal(loads, 1);
    assert.deepEqual(
      result.document.jobs.map(({ company, title }) => [company, title]),
      [
        ['Fixture Company', 'Lead engineer'],
        ['Fixture Company', 'Engineer'],
        ['Earlier Company', 'Earlier engineer'],
      ]
    );
    assert.deepEqual(result.document.jobs[0].skills, ['Rust']);
    assert.equal(result.document.jobs[0].media[0].title, 'Demo');
    assert.equal(
      result.document.jobs[0].native.text.includes('duplicate'),
      false
    );
    assert.equal(
      result.document.jobs[0].description,
      'Built Rust systems.\nKept original descriptions.'
    );
    assert.equal(result.files.length, 4);
    return {
      synthetic: true,
      actualCommander: true,
      loads,
      jobs: 3,
      datelessFragmentsAreJobs: false,
    };
  } finally {
    await context.close();
    await rm(dir, { recursive: true, force: true });
  }
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.E2E_EXECUTABLE_PATH ?? '/usr/bin/google-chrome',
  });
  try {
    console.log(JSON.stringify(await verifyLinkedinNativeExperience(browser)));
  } finally {
    await browser.close();
  }
}
