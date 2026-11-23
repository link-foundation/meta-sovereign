import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { makeBrowserCommander } from 'browser-commander';
import { inspectCurrentFormSession } from '../../js/src/forms/inspection.js';
import { planFormAnswers } from '../../js/src/forms/answer-plan.js';
import { storedFormAssignment } from '../../js/src/forms/assignment-store.js';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import {
  assignmentSectionHtml,
  taskDescription,
  taskSection,
} from './form-assignment-section-fixture.mjs';

const browser = await chromium.launch({
  executablePath: process.env.META_SOVEREIGN_TEST_CHROMIUM,
  timeout: 5000,
});
try {
  const page = await browser.newPage();
  const url = 'http://forms.test/application';
  let section = taskSection;
  await page.route(url, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: assignmentSectionHtml(section),
    })
  );
  await page.goto(url, { timeout: 5000 });
  const commander = makeBrowserCommander({
    page,
    enableNetworkTracking: false,
    enableNavigationManager: false,
    enableDialogManager: false,
  });
  const store = createMemoryStore();
  const inspect = () => inspectCurrentFormSession({ commander, page });
  try {
    const inspection = await inspect();
    const { planning } = await planFormAnswers(store, { inspection });
    const saved = await storedFormAssignment(store, url);
    console.log(
      JSON.stringify({
        absenceOfIntro: inspection.frames[0].intro === 'Application',
        state: planning.assignment?.state ?? null,
        description: saved?.description ?? null,
      })
    );
    assert.equal(
      planning.assignment?.state,
      'needs-repository',
      'an assignment section after the first control must hold the form'
    );
    assert.equal(saved.description, taskDescription);
    assert.equal(await page.locator('[name="english"]').inputValue(), '');
    await page.locator('#assignment li').evaluate((node) => {
      node.textContent += ' Use the provided sample data.';
    });
    const changed = await planFormAnswers(store, {
      inspection: await inspect(),
    });
    assert.notEqual(
      changed.planning.assignment.revision,
      planning.assignment.revision
    );
    assert.equal(
      (await storedFormAssignment(store, url)).description,
      `${taskDescription} Use the provided sample data.`
    );

    section =
      '<section><h2>No test task required</h2><p>Answer the ordinary questions.</p></section><section hidden><h2>Test task</h2><p>Hidden task.</p></section>';
    await page.reload({ timeout: 5000 });
    assert.equal((await inspect()).frames[0].assignmentSections, undefined);
    section = `<section><h2>Test task</h2><p>${'x'.repeat(30001)}</p></section>`;
    await page.reload({ timeout: 5000 });
    const oversized = await inspect();
    assert.equal(oversized.frames[0].assignmentSectionsLimited, true);
    await assert.rejects(planFormAnswers(store, { inspection: oversized }), {
      code: 'form-assignment-limit',
    });
    section = `<div class="g-recaptcha">Verification</div>${taskSection}`;
    await page.reload({ timeout: 5000 });
    const verification = await inspect();
    assert.equal(verification.challenge?.active, true);
    assert.equal(verification.frames[0].assignmentSections, undefined);
    assert.deepEqual(verification.fields, []);
    console.log(
      JSON.stringify({
        revisionChanged: true,
        waivedIgnored: true,
        hiddenIgnored: true,
        oversizedRefusal: true,
        verificationWithheld: true,
      })
    );
  } finally {
    await commander.destroy();
    await store.close?.();
  }
} finally {
  await browser.close();
}
