import assert from 'node:assert/strict';
import { readAssignmentSourceDocument } from '../../src/assignments/source-document.js';
import { readCvAboutPreparation } from '../../src/jobs/cv-prepare-document.js';
import { readCvEditorDocument } from '../../src/jobs/cv-watch-document.js';
import {
  cvWorkplaceSelectors,
  readCvWorkplaceControls,
} from '../../src/jobs/cv-workplace-controls.js';
import { prepareNativeCvWorkplace } from '../../src/jobs/cv-prepare-workplace.js';
import {
  hhContentMarkup,
  observeHhContentReads,
} from '../../../experiments/issue-56/hh-content-dom.mjs';
import { verifyCvWorkplaceReadbackDocument } from './e2e-cv-workplace-readback.mjs';

const ordinaryContent = (reader, result) => {
  assert(!result?.challenge && !result?.blocked);
  if (reader === readAssignmentSourceDocument) {
    assert(
      result.complete &&
        result.text.includes('Private synthetic employer instructions.')
    );
  } else if (reader === readCvWorkplaceControls) {
    assert.equal(result.fields.company, 'Employer');
  } else {
    assert.equal(result.about, 'Native CV prose.');
  }
};

const verifyContentStates = async (page, marker, reader, input, workplace) => {
  for (const hidden of [false, true]) {
    await page.setContent(hhContentMarkup(marker, hidden, workplace));
    await page.evaluate(observeHhContentReads);
    const result = await page.evaluate(reader, input);
    if (hidden) {
      ordinaryContent(reader, result);
      assert(await page.evaluate(() => globalThis.hhContentReads > 0));
    } else {
      assert(
        result?.challenge || result?.blocked,
        reader === readAssignmentSourceDocument
          ? 'Assignment instructions escaped HH verification.'
          : `${reader.name} ignored HH verification.`
      );
      assert.equal(await page.evaluate(() => globalThis.hhContentReads), 0);
    }
  }
  // visibility:hidden retains layout boxes; it must still be ignored.
  await page.setContent(hhContentMarkup(marker, false, workplace));
  await page.locator('#challenge').evaluate((node) => {
    node.style.visibility = 'hidden';
  });
  const hidden = await page.evaluate(reader, input);
  ordinaryContent(reader, hidden);
};

const refuseWorkplacePreparation = async (page) => {
  await assert.rejects(
    prepareNativeCvWorkplace({
      session: {
        page: { url: () => 'https://hh.ru/profile/edit/experience/123' },
        commander: {
          evaluate: ({ fn, args }) =>
            fn === readCvEditorDocument
              ? { kind: 'workplace' }
              : page.evaluate(fn, args[0]),
        },
      },
      change: { workplace: { recordId: '123' } },
      check: () => {},
    }),
    { code: 'jobs-cv-draft' }
  );
};

/** One isolated native document; every challenged read stays metadata-only. */
export const verifyNativeHhContent = async (browser) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let holds = 0;
  let ordinary = 0;
  try {
    for (const marker of ['qa', 'name']) {
      for (const [reader, input, workplace] of [
        [readAssignmentSourceDocument],
        [readCvAboutPreparation],
        [readCvEditorDocument],
        [readCvWorkplaceControls, cvWorkplaceSelectors, true],
      ]) {
        await verifyContentStates(page, marker, reader, input, workplace);
        holds++;
        ordinary += 2;
      }
      await page.setContent(hhContentMarkup(marker, false, true));
      await page.evaluate(observeHhContentReads);
      await refuseWorkplacePreparation(page);
      assert.equal(await page.evaluate(() => globalThis.hhContentReads), 0);
      holds++;
      for (const hidden of [false, true]) {
        const result = await page.evaluate(readCvEditorDocument, {
          html: hhContentMarkup(marker, hidden, true),
          url: 'https://hh.ru/profile/edit/experience/123',
        });
        assert.equal(result?.challenge ?? false, !hidden);
        assert.equal(result.kind, hidden ? 'workplace' : 'unavailable');
        if (hidden) {
          ordinary++;
        } else {
          holds++;
        }
      }
    }
    await page.setContent(hhContentMarkup('qa', true, true));
    await page.locator('body').evaluate((node) => {
      node.insertAdjacentHTML(
        'beforeend',
        '<section role="dialog" hidden><button data-qa="profile-layout-save-button">Owner Save</button></section>'
      );
    });
    await refuseWorkplacePreparation(page);
    await verifyCvWorkplaceReadbackDocument(
      page,
      'https://hh.ru/profile/edit/experience/123'
    );
    assert.equal(await page.evaluate(() => globalThis.hhContentActions), 0);
    assert.deepEqual(errors, []);
    return {
      markers: 2,
      readers: 4,
      paths: 5,
      foreignSaveDialogPreserved: true,
      holds,
      ordinary,
      sensitiveReads: 0,
      actions: 0,
      errors,
    };
  } finally {
    await context.close();
  }
};
