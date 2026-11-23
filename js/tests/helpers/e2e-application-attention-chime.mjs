import assert from 'node:assert/strict';
import {
  addApplicationVerification,
  openApplicationVerification,
} from '../../../experiments/issue-56/application-verification-fixture.mjs';

const watchRealAudio = () => {
  const { Audio, document, localStorage } = globalThis;
  localStorage.setItem('metaSovereignNotifySound', 'true');
  localStorage.setItem('metaSovereignNotify', 'false');
  const events = [];
  globalThis.fixtureChimeEvents = events;
  document.addEventListener('securitypolicyviolation', (event) => {
    if (event.effectiveDirective === 'media-src') {
      events.push({ event: 'blocked', source: event.blockedURI });
    }
  });
  globalThis.Audio = function observeAudio(source) {
    const audio = new Audio(source);
    audio.addEventListener('canplay', () => {
      events.push({ event: 'ready', source, duration: audio.duration });
    });
    audio.addEventListener('playing', () => {
      events.push({ event: 'playing', source });
    });
    audio.addEventListener('error', () => {
      events.push({ event: 'error', source, code: audio.error?.code });
    });
    return audio;
  };
};

export const verifyApplicationAttentionChime = async (browser) => {
  const { fixture, owner, receipt, action } =
    await openApplicationVerification(browser);
  const { page, base } = fixture;
  try {
    await page.addInitScript(watchRealAudio);
    await page.goto(`${base}/#/settings`);
    await page.getByRole('heading', { name: 'Settings', exact: true }).click();
    await owner.evaluate(addApplicationVerification, false);
    assert.equal(
      (await action('read', receipt, { browserSlot: 'interview' })).state,
      'verification'
    );
    const required =
      browser.browserType().name() === 'chromium' ? 'playing' : 'ready';
    await page.waitForFunction(
      (type) =>
        globalThis.fixtureChimeEvents.some((row) =>
          [type, 'blocked', 'error'].includes(row.event)
        ),
      required,
      { timeout: 10000 }
    );
    const events = await page.evaluate(() => globalThis.fixtureChimeEvents);
    const ready = events.find((row) => row.event === 'ready');
    assert.equal(
      events.some((row) => ['blocked', 'error'].includes(row.event)),
      false,
      `real notification chime must pass the media policy: ${JSON.stringify(events)}`
    );
    assert.ok(ready);
    assert.equal(new URL(ready.source, base).origin, base);
    assert.ok(ready.duration > 0.35 && ready.duration < 0.37);
    return { systemNotifications: false, duration: ready.duration, events };
  } finally {
    await fixture.close();
  }
};
