import { assert } from './e2e-chat.mjs';
import { readAssignmentSourceDocument } from '../../src/assignments/source-document.js';
import {
  assignmentSourceHtml,
  instructionText,
} from '../../../experiments/issue-56/assignment-source-fixture.mjs';

export const verifyAssignmentSourceDocument = async ({ page }) => {
  const context = await page.context().browser().newContext();
  const document = await context.newPage();
  try {
    await document.setContent(assignmentSourceHtml);
    let read = await document.evaluate(readAssignmentSourceDocument);
    assert(
      read.complete && read.text.includes(instructionText),
      'actual visible DOM instructions are complete'
    );
    assert(
      !/Private|Invisible|Hidden/u.test(read.text),
      'no hidden text or control values'
    );
    for (const markup of [
      '<input type="password">',
      '<div class="g-recaptcha"></div>',
      '<canvas></canvas>',
      '<iframe src="about:blank"></iframe>',
      '<embed type="application/pdf">',
      `<p>${'x'.repeat(30001)}</p>`,
      '<p>word</p>'.repeat(2501),
      '<span><span></span></span>'.repeat(5001),
    ]) {
      await document.setContent(
        `<main><h1>Task instructions</h1>${markup}</main>`
      );
      read = await document.evaluate(readAssignmentSourceDocument);
      assert(
        !read.complete,
        'blocked, unreadable and finite-limit documents refuse'
      );
    }
    await document.setContent(
      '<main><h1>Task instructions</h1><div role="textbox">Private custom answer</div><p>Visible task requirement.</p></main>'
    );
    read = await document.evaluate(readAssignmentSourceDocument);
    assert(
      read.complete &&
        read.text.includes('Visible task requirement.') &&
        !read.text.includes('Private'),
      'ARIA editors are excluded'
    );
    console.log(
      '[assignment-source-document]',
      JSON.stringify({ cases: 10, sensitiveGetters: 0, closed: true })
    );
  } finally {
    await context.close();
  }
};
