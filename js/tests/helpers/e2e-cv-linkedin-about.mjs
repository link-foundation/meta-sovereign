import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { linkedinAboutBrowserFixture } from '../../../experiments/issue-56/linkedin-about-browser-fixture.mjs';
import { createLinkedinAboutCommands } from '../../src/cli/cv-linkedin-about-command.js';
import { confirmedLinkedinAboutJob } from '../../src/cv/linkedin-about-receipt.js';
import { LINO_BINARY, LINO_TEXT } from '../../src/transport/lino.js';

export const verifyCvLinkedinAbout = async (browser) => {
  const fixture = await linkedinAboutBrowserFixture(browser);
  const { page, provider, state, plan, input, request, initial, source } =
    fixture;
  page.setDefaultTimeout(12000);
  const prior = process.env.LINKEDIN_ABOUT_BEFORE_BUNDLE;
  const directory = process.env.LINKEDIN_ABOUT_SCREENSHOTS;
  const section = page.locator('[data-experience-plan-kind="profile"]');
  const job = section.locator('[data-linkedin-about-phase]');
  const action = (name) => job.locator(`[data-hh-workplace-action="${name}"]`);
  const phase = async (name) => {
    try {
      await job
        .and(page.locator(`[data-linkedin-about-phase="${name}"]`))
        .waitFor();
    } catch (error) {
      throw new Error(
        `Expected LinkedIn About phase ${name}. Current control: ${await job.innerText()}. Native URL: ${provider.url()}. ${JSON.stringify(state)}`,
        { cause: error }
      );
    }
  };
  const field = provider.locator('#summary');
  const capture = async (name, locator) => {
    if (directory) {
      await mkdir(directory, { recursive: true });
      await locator.scrollIntoViewIfNeeded();
      await locator.page().screenshot({ path: join(directory, `${name}.png`) });
    }
  };
  const reset = async () => {
    await provider.goto(input.url);
    await action('reset').click();
  };
  const directed = {
    planRequestId: plan.requestId,
    fingerprint: plan.fingerprint,
  };
  const terminal = async (type, requestId, wanted) => {
    for (let pass = 0; pass < 120; pass++) {
      const { row } = await request('linkedin-about-status', type, {
        requestId,
      });
      if (wanted.includes(row.phase)) {
        return row;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('LinkedIn About review did not reach its expected state.');
  };
  try {
    assert.equal(plan.phase, 'completed');
    if (prior) {
      const body = await readFile(prior);
      await page.route('**/app.min.js*', (route) =>
        route.fulfill({ body, contentType: 'application/javascript' })
      );
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${fixture.base}/#/cv`);
    await page.locator('[data-experience-documents] summary').first().click();
    const panel = page.locator('[data-experience-plan]');
    await panel.locator('[data-experience-plan-request]').fill(plan.requestId);
    await panel.locator('[data-experience-plan-action="status"]').click();
    await section.waitFor();
    assert.match(await section.innerText(), /Original biography/u);
    if (prior) {
      await capture('before', section);
      assert.equal(
        await action('start').count(),
        1,
        'LinkedIn About needs a native review action'
      );
      return;
    }

    const lost = { ...directed, requestId: 'unreceived-about-start' };
    const stopped = await request('linkedin-about-stop', LINO_TEXT, lost);
    assert.equal(confirmedLinkedinAboutJob(stopped.row, lost).phase, 'left');
    const retry = await request('linkedin-about-start', LINO_TEXT, lost);
    assert.equal(confirmedLinkedinAboutJob(retry.row, lost).phase, 'left');
    assert.equal(state.editorOpens, 0);

    await action('start').click();
    await phase('prepared');
    assert.equal(await field.inputValue(), source.cv.about);
    assert.equal(state.saves, 0);
    assert.equal(
      await provider.getByText('Skills · Rust · PostgreSQL').count(),
      1
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= globalThis.innerWidth + 1
      ),
      true
    );
    await capture('prepared-phone', job);
    await capture('native-draft', field);
    await action('skip').click();
    await phase('skipped');
    assert.deepEqual(
      [state.editorOpens, state.saves, state.discards],
      [1, 0, 1]
    );

    await reset();
    await action('start').click();
    await phase('prepared');
    await action('leave').click();
    await phase('left');
    assert.equal(await field.inputValue(), source.cv.about);
    assert.deepEqual(
      [state.editorOpens, state.saves, state.discards],
      [2, 0, 1]
    );

    await reset();
    await action('start').click();
    await phase('prepared');
    await field.fill('Owner-written replacement.');
    await action('save').click();
    await phase('failed');
    assert.equal(await field.inputValue(), 'Owner-written replacement.');
    assert.equal(state.saves, 0);
    await provider.goto(input.url);

    state.hostile = true;
    const wrong = { ...directed, requestId: 'unrelated-about-editor' };
    assert.equal(
      (
        await request(
          'linkedin-about-start',
          LINO_TEXT,
          wrong,
          'https://unrelated.test'
        )
      ).response.status,
      403
    );
    await request('linkedin-about-start', LINO_TEXT, wrong);
    assert.equal(
      (await terminal(LINO_TEXT, wrong.requestId, ['failed'])).code,
      'cv-linkedin-about-editor'
    );
    assert.equal(state.editorOpens, 3);
    state.hostile = false;

    state.stale = true;
    const binary = { ...directed, requestId: 'stale-about-readback' };
    await request('linkedin-about-start', LINO_BINARY, binary);
    await terminal(LINO_BINARY, binary.requestId, ['prepared']);
    const mismatch = await request('linkedin-about-decide', LINO_BINARY, {
      ...binary,
      planRequestId: 'unrelated-comparison',
      decision: 'save',
    });
    assert.equal(mismatch.response.status, 409);
    await request('linkedin-about-decide', LINO_BINARY, {
      ...binary,
      decision: 'save',
    });
    const stale = await terminal(LINO_BINARY, binary.requestId, [
      'unconfirmed',
    ]);
    assert.equal(stale.providerSaved, false);
    assert.equal(stale.save, null);
    assert.equal(state.about, initial);
    assert.equal(state.saves, 1);
    state.stale = false;

    await action('reset').click();
    await action('start').click();
    await phase('prepared');
    await provider.getByRole('button', { name: 'Save', exact: true }).click();
    await phase('saved');
    assert.match(await job.innerText(), /fresh LinkedIn profile confirms/u);
    await capture('saved-phone', job);

    state.about = initial;
    const auto = page.locator('[data-experience-auto]');
    await auto.locator('summary').click();
    const autoField = (name) =>
      auto.locator(`[data-experience-auto-field="${name}"]`);
    await autoField('url').fill(input.url);
    await autoField('hash').fill(input.hash);
    await autoField('to').selectOption('linkedin');
    const queued = (name) =>
      auto.locator(`[data-experience-review-action="${name}"]`);
    await queued('start').click();
    await auto.locator('[data-experience-review-phase="prepared"]').waitFor();
    assert.equal(await field.inputValue(), source.cv.about);
    await queued('save').click();
    await auto.locator('[data-experience-review-phase="completed"]').waitFor();
    const receipt = auto.locator('[data-experience-review-outcome="saved"]');
    assert.match(
      await receipt.getAttribute('data-experience-review-revision'),
      /^[a-f0-9]{64}$/u
    );
    assert.equal(state.about, source.cv.about);
    assert.deepEqual(
      [state.editorOpens, state.saves, state.discards],
      [6, 3, 1]
    );

    state.about = initial;
    const stdin = new PassThrough();
    const { store, ...about } = fixture.cli;
    const open = async () => ({ ...store, close: async () => {} });
    const commands = createLinkedinAboutCommands(
      { openStore: open, openReadOnly: open },
      {
        about,
        stdin,
        wait: async () => new Promise((resolve) => setTimeout(resolve, 25)),
        notice: () => stdin.end(),
      }
    );
    const args = {
      'request-id': 'linkedin-about-terminal-eof',
      'plan-request-id': directed.planRequestId,
      fingerprint: directed.fingerprint,
    };
    const terminalRows = [];
    const collect = (line) => terminalRows.push(JSON.parse(line));
    assert.equal(
      await commands['cv-experience-linkedin-about-start'](args, collect),
      0
    );
    assert.equal(
      await commands['cv-experience-linkedin-about-status'](args, collect),
      0
    );
    assert.deepEqual(
      terminalRows.map(({ phase }) => phase),
      ['left', 'left']
    );
    assert.equal(await field.inputValue(), source.cv.about);
    assert.deepEqual(
      [state.editorOpens, state.saves, state.discards],
      [7, 3, 1]
    );
    assert.equal(state.attached, state.detached);
    assert.deepEqual(fixture.errors, []);
  } finally {
    await fixture.close();
  }
};

export const verifyCvLinkedinAddAbout = async (browser) => {
  const fixture = await linkedinAboutBrowserFixture(browser, { empty: true });
  const { page, provider, state, plan, input, request, source } = fixture;
  const section = page.locator('[data-experience-plan-kind="profile"]');
  const job = section.locator('[data-linkedin-about-phase]');
  const action = (name) => job.locator(`[data-hh-workplace-action="${name}"]`);
  const phase = (name) =>
    job.and(page.locator(`[data-linkedin-about-phase="${name}"]`)).waitFor();
  const field = provider.locator('#summary');
  const directed = {
    planRequestId: plan.requestId,
    fingerprint: plan.fingerprint,
  };
  const screenshots = process.env.LINKEDIN_ADD_ABOUT_SCREENSHOTS;
  const capture = async (name, locator) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await locator.scrollIntoViewIfNeeded();
      await locator
        .page()
        .screenshot({ path: join(screenshots, `${name}.png`) });
    }
  };
  const startAndRefuse = async (requestId, code) => {
    await request('linkedin-about-start', LINO_BINARY, {
      ...directed,
      requestId,
    });
    for (let pass = 0; pass < 100; pass++) {
      const { row } = await request('linkedin-about-status', LINO_BINARY, {
        requestId,
      });
      if (row.phase === 'failed') {
        assert.equal(row.code, `cv-linkedin-about-${code}`);
        assert.equal(row.providerSaved, false);
        return;
      }
      assert.ok(['opening'].includes(row.phase), JSON.stringify(row));
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.fail('LinkedIn Add About did not refuse the changed baseline.');
  };
  try {
    page.setDefaultTimeout(10000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${fixture.base}/#/cv`);
    await page.locator('[data-experience-documents] summary').first().click();
    const panel = page.locator('[data-experience-plan]');
    await panel.locator('[data-experience-plan-request]').fill(plan.requestId);
    await panel.locator('[data-experience-plan-action="status"]').click();
    await section.waitFor();
    if (process.env.LINKEDIN_ADD_ABOUT_BEFORE === '1') {
      await capture('before', section);
    }
    assert.equal(
      plan.plan.profile.target.aboutAcquisition.boundary,
      'owner-add-about'
    );
    assert.equal(
      plan.plan.profile.fields.find(({ field }) => field === 'about').before,
      ''
    );
    assert.equal(await action('start').count(), 1);
    assert.match(await section.innerText(), /No About text/u);
    assert.deepEqual(
      [state.menuOpens, state.editorOpens, state.saves],
      [1, 0, 0]
    );

    state.about = 'Owner added a biography after export.';
    await startAndRefuse('about-now-exists', 'baseline');
    assert.deepEqual(
      [state.menuOpens, state.editorOpens, state.saves],
      [1, 0, 0]
    );
    assert.equal(state.about, 'Owner added a biography after export.');

    state.about = null;
    state.hostile = true;
    await startAndRefuse('about-wrong-profile', 'editor');
    assert.deepEqual(
      [state.menuOpens, state.editorOpens, state.saves],
      [2, 0, 0]
    );
    state.hostile = false;

    state.draft = 'Owner wrote an unsaved biography.';
    await startAndRefuse('about-owner-draft', 'baseline');
    assert.equal(await field.inputValue(), state.draft);
    assert.deepEqual([state.editorOpens, state.saves], [1, 0]);
    await provider.goto(input.url);
    state.draft = null;

    await action('start').click();
    await phase('prepared');
    assert.equal(await field.inputValue(), source.cv.about);
    assert.equal(state.saves, 0);
    await capture('prepared-phone', job);
    await capture('native-draft', field);
    await action('skip').click();
    await phase('skipped');
    assert.deepEqual([state.about, state.saves, state.discards], [null, 0, 1]);
    await action('reset').click();
    await action('start').click();
    await phase('prepared');
    await action('save').click();
    await phase('saved');
    assert.equal(state.about, source.cv.about);
    assert.deepEqual(
      [state.editorOpens, state.saves, state.discards],
      [3, 1, 1]
    );
    assert.equal(state.attached, state.detached);
    assert.deepEqual(fixture.errors, []);
    await capture('saved-phone', job);
  } finally {
    await fixture.close();
  }
};
