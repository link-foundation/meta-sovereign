import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { openBrowserSession } from '../../js/src/cv/browser.js';
import { createLinkedinPositionNative } from '../../js/src/cv/linkedin-position-native.js';
import { createLinkedinPositionReviews } from '../../js/src/cv/linkedin-position-review.js';
import { linkedinNativeHtml } from './linkedin-experience-native.mjs';
import { linkedinPositionFixtureUrl } from './linkedin-experience-fixture.mjs';
import { linkedinPositionFormHtml } from './linkedin-position-form-fixture.mjs';
import {
  linkedinPositionReference,
  linkedinPositionReviewFixture,
} from './linkedin-position-review-fixture.mjs';

export const linkedinPositionExperienceHtml = linkedinNativeHtml
  .replaceAll(
    'Built Rust systems.<br>Kept original descriptions.',
    'Worked on Rust and PostgreSQL.'
  )
  .replaceAll('>London</span>', '>London, United Kingdom</span>');

export const verifyLinkedinPositionNative = async (browser) => {
  const fixture = await linkedinPositionReviewFixture();
  const context = await browser.newContext();
  const nav = [];
  const saves = [];
  try {
    await context.addCookies([
      {
        name: 'li_at',
        value: 'synthetic-cookie',
        domain: '.linkedin.com',
        path: '/',
      },
    ]);
    const page = await context.newPage();
    const other = await context.newPage();
    const url = fixture.linkedin.document.source.url;
    const skillsUrl = url.replace(/experience\/$/u, 'skills/');
    const editor = linkedinPositionFixtureUrl('1101');
    const addUrl = linkedinPositionFixtureUrl('new');
    let changed = false;
    let detachCount = 0;
    await context.route('**/*', async (route) => {
      const target = route.request().url();
      nav.push(target);
      assert.equal(route.request().method(), 'GET');
      assert.ok([url, editor, addUrl, skillsUrl].includes(target));
      if (target === skillsUrl) {
        return route.fulfill({
          contentType: 'text/html',
          body: '<main><h1>Skills</h1></main>',
        });
      }
      await route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body:
          target === url
            ? linkedinPositionExperienceHtml
            : linkedinPositionFormHtml({ add: target === addUrl, changed }),
      });
    });
    const open = createLinkedinPositionNative({
      profileDir: path.join(fixture.dir, 'native-form'),
      store: fixture.store,
      wait: async () => {},
      openSession: (settings) => {
        assert.equal(settings.slot, 'linkedin-experience');
        assert.equal(settings.persistent, true);
        assert.equal(settings.headless, false);
        return openBrowserSession({
          ...settings,
          launcher: async () => ({
            page,
            detach: async () => {
              detachCount++;
            },
          }),
        });
      },
    });
    const source = globalThis.structuredClone(fixture.hh);
    Object.assign(source.jobs[0], { current: false, end: '2025-12' });
    const row = await fixture.complete({ source });
    const service = createLinkedinPositionReviews(fixture);
    const approved = async (kind) => {
      const { fingerprint } = await service.stage(
        linkedinPositionReference(row, kind)
      );
      return service.review({ fingerprint });
    };
    const plan = await approved('update');
    const add = await approved('add');
    await other.setContent(
      '<dialog open><textarea>Existing owner draft.</textarea></dialog>'
    );
    const shouldNotPrepare = () =>
      assert.fail('An unsafe form reached preparation');
    await assert.rejects(open(plan, undefined, shouldNotPrepare), {
      code: 'cv-linkedin-position-owner-draft',
    });
    assert.deepEqual(nav, []);
    assert.equal(
      await other.locator('textarea').inputValue(),
      'Existing owner draft.'
    );
    await other.close();
    changed = true;
    await assert.rejects(open(plan, undefined, shouldNotPrepare), {
      code: 'cv-linkedin-position-conflict',
    });
    assert.equal(
      await page.locator('#description').innerText(),
      'A newer owner description.'
    );
    assert.equal(
      await page.locator('[role=switch]').getAttribute('aria-checked'),
      'true'
    );
    await page.locator('button', { hasText: 'Cancel' }).click();
    changed = false;
    await open(plan, undefined, async ({ controls, form }) => {
      assert.equal(page.url(), editor);
      assert.equal(controls.description.value, 'Reviewed description.');
      assert.equal(controls.current.value, false);
      assert.equal(controls.endMonth.value, 'dec');
      assert.equal(controls.endYear.value, '2025');
      assert.equal(controls.notify.value, false);
      assert.equal(
        await page.locator('[name=employment]').inputValue(),
        'Full-time'
      );
      await page.locator('#description').fill('Owner changed the draft.');
      await assert.rejects(
        form.change(controls, {
          name: 'description',
          kind: 'text',
          value: 'Replayed value',
        }),
        {
          code: 'cv-linkedin-position-conflict',
        }
      );
      saves.push(await page.evaluate(() => window.fixtureSaves ?? 0));
    });
    assert.equal(
      await page.locator('#description').innerText(),
      'Owner changed the draft.'
    );
    assert.equal(await page.locator('dialog').isVisible(), true);
    await page.locator('button', { hasText: 'Cancel' }).click();
    await open(add, undefined, async ({ controls }) => {
      assert.equal(page.url(), addUrl);
      assert.equal(controls.title.value, 'Developer');
      assert.equal(controls.company.value, 'Standalone company');
      assert.equal(controls.startYear.value, '2016');
      assert.equal(controls.startMonth.value, 'apr');
      assert.equal(controls.endYear.value, '2018');
      assert.equal(controls.endMonth.value, 'jan');
      saves.push(await page.evaluate(() => window.fixtureSaves ?? 0));
    });
    assert.deepEqual(saves, [0, 0]);
    assert.deepEqual(nav, [
      url,
      skillsUrl,
      editor,
      url,
      skillsUrl,
      editor,
      url,
      addUrl,
    ]);
    assert.equal(detachCount, 4);
    return {
      synthetic: true,
      providerSaves: 0,
      ownerDraftsPreserved: 2,
      opens: 2,
      detachCount,
    };
  } finally {
    await context.close();
    await fixture.close();
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
    console.log(JSON.stringify(await verifyLinkedinPositionNative(browser)));
  } finally {
    await browser.close();
  }
}
