import assert from 'node:assert/strict';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { openBrowserSession } from '../../js/src/cv/browser.js';
import { createLinkedinPositionJobs } from '../../js/src/cv/linkedin-position-job.js';
import { createLinkedinPositionReviews } from '../../js/src/cv/linkedin-position-review.js';
import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import {
  linkedinExperienceRaw,
  linkedinPositionFixtureUrl,
} from './linkedin-experience-fixture.mjs';
import { waitForLinkedinPositionPhase } from './linkedin-position-job-native.mjs';
import { linkedinPositionMediaHtml } from './linkedin-position-media-fixture.mjs';
import { linkedinPositionExperienceHtml } from './linkedin-position-native.mjs';
import {
  linkedinPositionReference,
  linkedinPositionReviewFixture,
} from './linkedin-position-review-fixture.mjs';

export const verifyLinkedinPositionMedia = async (browser) => {
  const legacy = {
    url: 'https://www.example.test/old/portfolio?q=1',
    title: 'Fixture Company',
  };
  const renamed = {
    url: legacy.url,
    title: 'example.test/old/portfolio?q=1',
    previousTitle: legacy.title,
  };
  const fixture = await linkedinPositionReviewFixture({
    raw: () => {
      const raw = linkedinExperienceRaw();
      raw.items[0].roles[0].marks.push({
        href: legacy.url,
        text: legacy.title,
      });
      return raw;
    },
  });
  const context = await browser.newContext();
  let jobs;
  try {
    const website = 'example.test/portfolio?mode=work';
    const attachment = { url: `https://${website}`, title: website };
    const original = fixture.linkedin.document.jobs.find(
      ({ title }) => title === 'Lead engineer'
    );
    const plan = await fixture.complete({
      source: {
        ...fixture.hh,
        jobs: [{ ...original, native: { website } }],
      },
    });
    const reviews = createLinkedinPositionReviews(fixture);
    const proposal = await reviews.stage(
      linkedinPositionReference(plan, 'update')
    );
    assert.deepEqual(proposal.fields, {});
    assert.deepEqual(proposal.media, attachment);
    const approval = await reviews.review({
      fingerprint: proposal.fingerprint,
    });
    const renamePlan = await fixture.complete({
      source: {
        ...fixture.hh,
        jobs: [{ ...original, native: { website: legacy.url } }],
      },
    });
    const renameDraft = await reviews.stage(
      linkedinPositionReference(renamePlan, 'update')
    );
    assert.deepEqual(renameDraft.fields, {});
    assert.deepEqual(renameDraft.media, renamed);
    const renameApproval = await reviews.review({
      fingerprint: renameDraft.fingerprint,
    });

    await context.addCookies([
      {
        name: 'li_at',
        value: 'synthetic-cookie',
        domain: '.linkedin.com',
        path: '/',
      },
    ]);
    const page = await context.newPage();
    const url = fixture.linkedin.document.source.url;
    const editor = linkedinPositionFixtureUrl('1101');
    const writes = [];
    const trace = [];
    let published = '';
    let scenario = 'fresh';
    await context.route('**/*', async (route) => {
      const request = route.request();
      const target = new URL(request.url());
      trace.push([request.method(), target.href]);
      if (
        target.pathname === '/fixture-position-save' &&
        request.method() === 'POST'
      ) {
        writes.push(JSON.parse(request.postData()));
        published =
          { fresh: 'media', prose: 'description', rename: 'renamed' }[
            scenario
          ] ?? '';
        return route.fulfill({ status: 200, body: 'ok' });
      }
      if (request.method() !== 'GET' || ![url, editor].includes(target.href)) {
        return route.abort();
      }
      const rendered =
        { legacy, renamed, custom: { ...legacy, title: 'Owner portfolio' } }[
          published
        ] ?? attachment;
      const link = `<a href="${rendered.url}">${rendered.title}</a>`;
      const marker =
        published === 'description'
          ? `<p class="inline-show-more-text">See ${link}</p>`
          : link;
      const body =
        target.href === url
          ? published
            ? linkedinPositionExperienceHtml.replace(
                'Skills: Rust</a>',
                `Skills: Rust</a>${marker}`
              )
            : linkedinPositionExperienceHtml
          : linkedinPositionMediaHtml({
              existing: {
                existing: attachment,
                rename: legacy,
                'wrong-preview': legacy,
              }[scenario],
              broken: scenario === 'broken',
              previewUrl: {
                rename: legacy.url,
                'wrong-preview': 'https://other.test/',
              }[scenario],
            });
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body });
    });
    jobs = createLinkedinPositionJobs({
      ...fixture,
      profileDir: join(fixture.dir, 'position-media'),
      wait: (ms, signal) => delay(Math.min(ms, 12), undefined, { signal }),
      openSession: (options) =>
        openBrowserSession({
          ...options,
          launcher: async () => ({ page, detach: async () => {} }),
        }),
    });
    const start = async (kind, expected) => {
      scenario = kind;
      published =
        {
          'already-exported': 'media',
          rename: 'legacy',
          'owner-title': 'custom',
          'wrong-preview': 'legacy',
        }[kind] ?? '';
      const input = {
        requestId: `position-media-${kind}`,
        fingerprint: (['legacy', 'custom'].includes(published)
          ? renameApproval
          : approval
        ).fingerprint,
      };
      await jobs.start(input);
      const row = await waitForLinkedinPositionPhase(
        jobs,
        input,
        expected,
        trace
      );
      return { input, row };
    };
    const save = async (input, expected) => {
      await jobs.decide({ ...input, decision: 'save' });
      return waitForLinkedinPositionPhase(jobs, input, expected, trace);
    };
    const prepared = await start('fresh', 'prepared');
    assert.equal(prepared.row.canSave, true);
    assert.deepEqual(prepared.row.preparedMedia, attachment);
    assert.deepEqual(
      await page.locator('#attachments a').getAttribute('href'),
      attachment.url
    );
    assert.equal(await page.evaluate(() => window.fixtureMediaAttaches), 1);
    assert.deepEqual(writes, []);
    assert.deepEqual(
      (await save(prepared.input, 'saved')).save.media,
      attachment
    );
    assert.deepEqual(writes[0].media, [attachment]);

    const stale = await start('stale', 'prepared');
    assert.equal((await save(stale.input, 'unconfirmed')).providerSaved, false);
    assert.equal(writes.length, 2);

    const prose = await start('prose', 'prepared');
    assert.equal((await save(prose.input, 'unconfirmed')).providerSaved, false);
    assert.equal(writes.length, 3);

    const opens = trace.filter(([, href]) => href === editor).length;
    const alreadyExported = await start('already-exported', 'no-changes');
    assert.equal(alreadyExported.row.providerSaved, false);
    assert.equal(trace.filter(([, href]) => href === editor).length, opens);

    const existing = await start('existing', 'no-changes');
    assert.equal(existing.row.providerSaved, false);
    assert.equal(await page.evaluate(() => window.fixtureLinkOpens), 0);
    assert.equal(writes.length, 3);

    const currentOwnerTitle = await start('owner-title', 'no-changes');
    assert.deepEqual(currentOwnerTitle.row.unapplied, ['media']);
    assert.equal(writes.length, 3);

    const renamedDraft = await start('rename', 'prepared');
    assert.deepEqual(renamedDraft.row.preparedMedia, renamed);
    assert.deepEqual(await page.locator('#attachments a').allTextContents(), [
      `Edit media, ${renamed.title}`,
    ]);
    assert.equal(await page.evaluate(() => window.fixtureMediaRenames), 1);
    assert.equal(writes.length, 3);
    assert.deepEqual(
      (await save(renamedDraft.input, 'saved')).save.media,
      renamed
    );
    assert.deepEqual(writes[3].media, [
      { url: legacy.url, title: renamed.title },
    ]);

    const wrong = await start('wrong-preview', 'failed');
    assert.equal(wrong.row.code, 'cv-linkedin-position-media-review');
    assert.equal(
      await page.getByLabel('Title', { exact: true }).last().inputValue(),
      legacy.title
    );
    assert.equal(await page.evaluate(() => window.fixtureMediaRenames), 0);
    assert.equal(writes.length, 4);
    await page.goto(url);

    const broken = await start('broken', 'failed');
    assert.equal(broken.row.code, 'cv-linkedin-position-media-review');
    await page
      .getByRole('heading', { name: 'Add media', exact: true })
      .waitFor();
    assert.equal(writes.length, 4);
    return {
      synthetic: true,
      attachmentsBeforeSave: 1,
      verifiedMediaSaves: 1,
      verifiedMediaRenames: 1,
      rejectedWrongPreviews: 1,
      unconfirmedReadbacks: 2,
      duplicatePreviews: 0,
      brokenPreviewsLeftOpen: 1,
    };
  } finally {
    await jobs?.close();
    await context.close();
    await fixture.close();
  }
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await runBrowserScenarios('linkedin-position-media', [
    verifyLinkedinPositionMedia,
  ]);
}
