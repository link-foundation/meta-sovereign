// Exercise the complete legacy importer after a real retained-document link.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { openChatApp } from '../../js/tests/helpers/e2e-chat.mjs';
import { openQuestionPreview } from '../../js/tests/helpers/question-preview.mjs';
import { verifyQuestionLegacyProfile } from '../../js/tests/helpers/e2e-question-legacy-profile.mjs';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../js/src/web/tutorial.js';

const store = createMemoryStore();
const { page, base, finish } = await openChatApp('legacy-retained-disclosure', {
  store,
});
await finish(async () => {
  await page.addInitScript(
    ([key, version]) =>
      globalThis.localStorage.setItem(
        key,
        JSON.stringify({ off: true, v: version })
      ),
    [TUTORIAL_STORAGE_KEY, TUTORIAL_VERSION]
  );
  const url = `${base}/?profile-check=legacy#/automation`;
  await page.goto(url);
  const { panel } = await openQuestionPreview(page);
  const document = await page.evaluateHandle(() => globalThis.document);
  // Choose the browser's real same-document navigation path explicitly.
  // The provider scenario still uses every actual control and API request.
  const retainedPage = new Proxy(page, {
    get(target, key) {
      if (key === 'goto') {
        return async (next) => {
          assert.equal(next, url);
          await page.evaluate((value) => {
            globalThis.location.href = value;
          }, next);
          assert.equal(
            await document.evaluate(
              (previous) => previous === globalThis.document
            ),
            true
          );
        };
      }
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const before = process.argv.includes('--before');
  page.setDefaultTimeout(before ? 2000 : 10000);
  await mkdir('docs/screenshots/issue-56-ci-legacy-disclosure', {
    recursive: true,
  });
  if (before) {
    await assert.rejects(
      verifyQuestionLegacyProfile({ page: retainedPage, base, store }),
      /locator.click: Timeout/
    );
    assert.equal(await panel.evaluate((node) => node.open), false);
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'docs/screenshots/issue-56-ci-legacy-disclosure/before.png',
    });
    console.log(
      JSON.stringify({
        reproduced: true,
        retainedDocument: true,
        rootClosed: true,
      })
    );
  } else {
    await verifyQuestionLegacyProfile({ page: retainedPage, base, store });
    assert.equal(
      (await store.get('qa-profile:legacy-owner')).values.email,
      'edited@example.test'
    );
    assert.equal(await panel.evaluate((node) => node.open), true);
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'docs/screenshots/issue-56-ci-legacy-disclosure/after.png',
    });
    console.log(
      JSON.stringify({
        retainedDocument: true,
        legacyImport: true,
        failedSavePreserved: true,
        profileSaved: true,
        providerEffects: 0,
      })
    );
  }
  await document.dispose();
});
