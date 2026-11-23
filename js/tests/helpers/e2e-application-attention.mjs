import assert from 'node:assert/strict';
import {
  openApplicationVerification,
  addApplicationVerification,
  clearApplicationVerification,
} from '../../../experiments/issue-56/application-verification-fixture.mjs';
import { LINO_TEXT, readWireResponse } from '../../src/transport/lino.js';

const privateState = (owner) =>
  owner.evaluate(() => ({
    challengeReads: globalThis.challengeReads,
    submits: globalThis.applicationAttempts,
  }));

export const verifyNativeApplicationAttention = async (browser) => {
  const { fixture, owner, receipt, action } =
    await openApplicationVerification(browser);
  const { page, base } = fixture;
  const banner = page.locator('[data-application-attention="interview"]');
  const attention = () =>
    fetch(`${base}/api/vacancies/application-attention`, {
      headers: { accept: LINO_TEXT },
    });
  const current = async () => {
    const response = await attention();
    assert.equal(
      response.status,
      200,
      'read-only HeadHunter verification route'
    );
    return (await readWireResponse(response)).attention;
  };
  try {
    await owner.evaluate(addApplicationVerification, false);
    let latest = await action('read', receipt, { browserSlot: 'interview' });
    assert.equal(latest.state, 'verification');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/#/settings`);
    if (process.env.HH_ATTENTION_SCREENSHOTS === 'before') {
      await page.locator('main[data-view="settings"]').waitFor();
      await page.screenshot({
        path: 'docs/screenshots/issue-56-hh-attention-before.png',
      });
    }
    const [first] = await current();
    assert.equal(first.kind, 'hh-application-verification');
    await banner
      .getByText('Complete HeadHunter verification in interview to continue.')
      .waitFor();
    assert.equal(
      await page.evaluate(
        () =>
          globalThis.document.documentElement.scrollWidth <=
          globalThis.innerWidth
      ),
      true
    );
    if (process.env.HH_ATTENTION_SCREENSHOTS === 'after') {
      await page.screenshot({
        path: 'docs/screenshots/issue-56-hh-attention-after.png',
      });
    }
    const focused = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/vacancies/application-attention-focus') &&
        response.ok()
    );
    await banner.getByRole('button', { name: 'Show browser' }).click();
    await focused;
    assert.equal(fixture.records[0].focuses, 1);
    await owner.evaluate(clearApplicationVerification);
    assert.deepEqual(await current(), []);
    await banner.waitFor({ state: 'detached' });
    assert.deepEqual(await privateState(owner), {
      challengeReads: 0,
      submits: 0,
    });

    await owner.evaluate(addApplicationVerification, true);
    latest = await action('read', latest, { browserSlot: 'interview' });
    assert.equal(
      latest.state,
      'verification',
      'the nested form also needs owner verification'
    );
    const [nested] = await current();
    assert.notEqual(nested.id, first.id);
    await banner.waitFor();
    assert.deepEqual(await privateState(owner), {
      challengeReads: 0,
      submits: 0,
    });
    await action('close', latest, { browserSlot: 'interview' });
    assert.deepEqual(await current(), []);
    await banner.waitFor({ state: 'detached' });
    assert.equal(fixture.records[0].closed, true);
    return {
      namedWindowFocus: 1,
      mainAndNested: true,
      challengeReads: 0,
      submits: 0,
      closed: true,
    };
  } finally {
    await fixture.close();
  }
};
