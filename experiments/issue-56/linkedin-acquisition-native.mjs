import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import {
  verifyLinkedinNativeExperience,
  linkedinAboutHtml,
  linkedinRoleDescription,
} from './linkedin-experience-native.mjs';
import { scanLinkedinProfileAbout } from '../../js/src/cv/linkedin-profile-dom.js';
import { linkedinPositionFixtureUrl } from './linkedin-experience-fixture.mjs';

const editor = (label, id) =>
  `<a aria-label="${label}" href="${linkedinPositionFixtureUrl(id)}"><svg width="18" height="18" aria-hidden="true"></svg></a>`;
const role = (title, period, id) => `<li><div>${title}</div><div>${period}</div>
<div>London, United Kingdom</div><div class="inline-show-more-text">${linkedinRoleDescription(id)}</div>
${editor(`Edit ${title} at Fixture Company`, id)}
<ul><li><a href="https://www.linkedin.com/skill-associations-details/Rust/">Skills: Rust</a></li>
<li><a href="https://example.test/demo">Demo</a></li></ul></li>`;
const fallback = `<!doctype html><html lang="en"><body><main><h1>Experience</h1>${editor('Add position', 'new')}<ul>
<li class="pvs-list__paged-list-item" data-view-name="profile-component-entity"><div>Fixture Company</div><div>Full-time · 6 yrs</div>
<ul>${role('Lead engineer', 'Jan 2023 - Present', '1101')}${role('Engineer', '2020 - Dec 2022', '1102')}</ul></li>
<li class="pvs-list__paged-list-item"><div>Earlier engineer</div><div>Earlier Company · Full-time</div>
<div>2018 - 2020</div><div>Original earlier role.</div></li></ul></main></body></html>`;

export const verifyLinkedinAcquisition = async (browser) => {
  const entity = await verifyLinkedinNativeExperience(browser);
  const text = await verifyLinkedinNativeExperience(browser, fallback);
  const context = await browser.newContext();
  try {
    const url = 'https://www.linkedin.com/in/fixture-owner/';
    await context.route('**/*', (route) =>
      route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: linkedinAboutHtml,
      })
    );
    const page = await context.newPage();
    await page.goto(url);
    let scan = await page.evaluate(scanLinkedinProfileAbout, {
      url,
      expand: true,
    });
    assert.equal(scan.more, 1);
    scan = await page.evaluate(scanLinkedinProfileAbout, { url });
    assert.equal(scan.about, 'Original biography.\nRust and PostgreSQL.');
    await page.evaluate(() =>
      document
        .querySelector('main')
        .append(document.querySelector('section').cloneNode(true))
    );
    assert.equal(
      (await page.evaluate(scanLinkedinProfileAbout, { url })).blocked,
      true
    );
    await page.evaluate(() => {
      document.querySelectorAll('section')[1].remove();
      document.querySelector('main').innerHTML =
        '<input type="password" value="synthetic-credential">';
    });
    assert.equal(
      (await page.evaluate(scanLinkedinProfileAbout, { url })).blocked,
      true
    );
    return {
      entity,
      fallback: text,
      aboutGuards: 3,
      synthetic: true,
      providerWrites: 0,
    };
  } finally {
    await context.close();
  }
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.E2E_EXECUTABLE_PATH ?? '/usr/bin/google-chrome',
  });
  try {
    console.log(JSON.stringify(await verifyLinkedinAcquisition(browser)));
  } finally {
    await browser.close();
  }
}
