import assert from 'node:assert/strict';
import { join } from 'node:path';
import { formatIndented, parseIndented } from 'lino-objects-codec';
import { runnerApiFixture } from '../../../experiments/issue-56/runner-api-fixture.mjs';
import { readRunnerProfile } from '../../src/cli/runner-profile.js';
import { requestRunner } from '../../src/cli/runner-client.js';
import {
  vkAutomationBrowser,
  captureVkAutomationLayouts,
} from './vk-automation-browser.mjs';

const overlay = {
  local: { port: 8128 },
  server: { host: 'local@example.invalid' },
};
const verifyOverlay = async ({
  layered,
  beforeLayers,
  profile,
  page,
  editor,
  screenshots,
  errors,
}) => {
  if (!layered) {
    return false;
  }
  assert.equal(profile.local.port, beforeLayers ? 8123 : 8128);
  assert.equal(
    profile.server.host,
    beforeLayers ? 'fixture@example.invalid' : 'local@example.invalid'
  );
  if (!beforeLayers) {
    return false;
  }
  await captureVkAutomationLayouts(page, editor, screenshots, 'before', true);
  assert.deepEqual(errors, []);
  return true;
};
const verifyGlobal = async (layered, fixture) => {
  if (layered) {
    assert.equal(
      (await readRunnerProfile(join(fixture.dir, 'runner.lino'))).server.host,
      'fixture@example.invalid'
    );
  }
};
const closeEditor = async (panel, editor, page, readCount) => {
  await panel.locator('[data-runner-profile-open]').click();
  await editor.waitFor({ state: 'detached' });
  const closedReads = readCount();
  await page.waitForTimeout(100);
  assert.equal(readCount(), closedReads);
};

export const verifyRunnerProfile = async (
  browser,
  { screenshots, beforeBundle, layered = false, beforeLayers = false } = {}
) => {
  const fixture = await runnerApiFixture(layered ? { overlay } : {});
  let context;
  try {
    const view = await vkAutomationBrowser(browser, '', fixture.base);
    context = view.context;
    context.setDefaultTimeout(10000);
    const { page, errors } = view;
    let reads = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/api/runner/profile')) {
        reads++;
      }
    });
    if (beforeBundle) {
      await page.route('**/app.min.js', (route) =>
        route.fulfill({ contentType: 'text/javascript', body: beforeBundle })
      );
    }
    await page.goto(`${fixture.base}/#settings`);
    const panel = page.locator('[data-runner-settings]');
    await panel.locator('[data-runner-open]').click();
    await panel
      .locator('[data-runner-mode=local] [data-runner-state=stopped]')
      .waitFor();
    assert.equal(reads, 0, 'closed profile editor performs no reads');
    if (beforeBundle) {
      await captureVkAutomationLayouts(
        page,
        panel,
        screenshots,
        'issue-56-runner-profile-before',
        true
      );
    }
    await panel.locator('[data-runner-profile-open]').click();
    const editor = panel.locator('[data-runner-profile-editor]');
    const document = editor.locator('[data-runner-profile-document]');
    const save = editor.locator('[data-runner-profile-save]');
    await document.waitFor();
    await page.waitForFunction(
      () =>
        !globalThis.document.querySelector('[data-runner-profile-document]')
          .disabled
    );
    assert.equal(await save.isDisabled(), true);
    const profile = parseIndented({ text: await document.inputValue() }).obj;
    const profileFile = join(
      layered ? fixture.localDir : fixture.dir,
      'runner.lino'
    );
    if (
      await verifyOverlay({
        layered,
        beforeLayers,
        profile,
        page,
        editor,
        screenshots,
        errors,
      })
    ) {
      return {
        localIgnored: true,
        noProcessMutation: true,
        liveProvider: false,
      };
    }
    profile.server.host = 'reviewed@example.invalid';
    await document.fill(formatIndented({ id: 'runner', obj: profile }));
    await save.click();
    await editor.locator('[data-runner-profile-saved]').waitFor();
    assert.equal(
      (await readRunnerProfile(profileFile)).server.host,
      'reviewed@example.invalid'
    );
    assert.equal(await save.isDisabled(), true);
    await captureVkAutomationLayouts(
      page,
      editor,
      screenshots,
      layered ? 'after' : 'issue-56-runner-profile-after',
      true
    );
    const saved = await requestRunner({ url: fixture.base, action: 'profile' });
    profile.server.host = 'other-owner@example.invalid';
    const other = await requestRunner({
      url: fixture.base,
      action: 'configure',
      document: formatIndented({ id: 'runner', obj: profile }),
      revision: saved.revision,
    });
    const draft = (await document.inputValue()).replace(
      layered ? '8128' : '8123',
      '8125'
    );
    await document.fill(draft);
    await save.click();
    await editor.getByRole('alert').waitFor();
    assert.equal(await document.inputValue(), draft);
    assert.equal(await save.isDisabled(), true);
    assert.equal(
      (await readRunnerProfile(profileFile)).server.host,
      'other-owner@example.invalid'
    );
    await captureVkAutomationLayouts(
      page,
      editor,
      screenshots,
      layered ? 'conflict' : 'issue-56-runner-profile-conflict',
      true
    );
    await editor.locator('[data-runner-profile-reload]').click();
    await editor.getByRole('alert').waitFor({ state: 'detached' });
    assert.equal(await document.inputValue(), other.document);
    assert.equal(await save.isDisabled(), true);
    await verifyGlobal(layered, fixture);
    await closeEditor(panel, editor, page, () => reads);
    assert.ok(
      fixture.backend.calls.every(([, action]) => action === 'probe'),
      'editing never starts or stops a session'
    );
    assert.deepEqual(errors, []);
    return {
      revisionConflictRetainsDraft: true,
      explicitReload: true,
      persistedProfile: true,
      noProcessMutation: true,
      closedEditorDoesNotRead: true,
      desktopAndPhoneFit: true,
      liveProvider: false,
    };
  } finally {
    await context?.close();
    await fixture.close();
  }
};

export const verifyLayeredRunnerProfile = (browser, options = {}) =>
  verifyRunnerProfile(browser, { ...options, layered: true });
