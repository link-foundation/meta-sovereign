import assert from 'node:assert/strict';
import {
  applicationDocument,
  applicationSelectors,
} from '../../src/jobs/application-page.js';

/** Fresh guards cannot admit a submit button, a link or a mismatched radio hash. */
export const verifyResumeAdmission = async (page) => {
  const url = 'https://hh.ru/vacancy/123';
  const menu = page.locator(applicationSelectors.resumeMenu);
  const handle = await menu.elementHandle();
  const refuse = async (target, action, selectors = applicationSelectors) => {
    const input = { url, selectors };
    const snapshot = await target.evaluate(applicationDocument, input);
    assert.deepEqual(
      await target.evaluate(applicationDocument, {
        ...input,
        action,
        resume: 'english',
        guard: JSON.stringify(snapshot),
      }),
      { dispatched: false }
    );
  };
  try {
    await handle.evaluate((node) => {
      node.closest('button').type = 'submit';
    });
    await refuse(handle, 'resumeMenu');
    await handle.evaluate((node) => {
      node.closest('button').type = 'button';
      const link = globalThis.document.createElement('a');
      link.href = 'https://hh.ru/vacancy/999';
      node.replaceWith(link);
      link.append(node);
    });
    await refuse(handle, 'resumeMenu');
    await handle.evaluate((node) => {
      node.parentElement.replaceWith(node);
    });
    await menu.click();
    const option = await page
      .locator('[role="option"][data-qa="magritte-select-option-english"]')
      .elementHandle();
    try {
      await option.evaluate((node) => {
        node.querySelector('input').value = 'different-hash';
      });
      await refuse(option, 'resumeChoice', {
        ...applicationSelectors,
        resumeChoice:
          '[role="option"][data-qa="magritte-select-option-english"]',
      });
    } finally {
      await option.dispose();
    }
    assert.equal(await page.evaluate(() => globalThis.applicationAttempts), 0);
    return 3;
  } finally {
    await handle.dispose();
  }
};
