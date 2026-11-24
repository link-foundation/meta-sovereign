import { makeBrowserCommander } from 'browser-commander';
import { createAssignmentSourceReader } from '../../js/src/assignments/source-reader.js';
import { PDF_INSTRUCTION_PAGES } from './assignment-pdf-fixture.mjs';

export const instructionText =
  'Account for damaged packages. Describe the daily reconciliation process. Keep the written proposal within three pages.';
export const assignmentSourceMarkdown = [
  '# Warehouse instructions',
  '',
  instructionText,
  'Record the dépôt name in the report.',
  '',
  '[Example](/unopened-markdown-example)',
  '',
  '```html',
  '<img src="/unopened-markdown-image" alt="Example">',
  '```',
].join('\n');
export const assignmentSourceHtml = `<!doctype html><html lang="en"><title>Warehouse instructions</title>
<main><h1>Warehouse instructions</h1><p>${instructionText}</p>
<p hidden>Hidden owner information</p><p style="display:none">Invisible information</p>
<label>Owner response <input id="owner-input" value="Private owner answer"></label>
<textarea>Private textarea answer</textarea><div contenteditable>Private editable answer</div>
<button>Private button action</button></main>
<script>for (const node of document.querySelectorAll('input,textarea')) Object.defineProperty(node,'value',{get(){throw new Error('Sensitive field value was read')}});</script>`;

export const withAssignmentSourceModel = (model) => async (request) => {
  const result = await model(request);
  const linked = JSON.parse(request.prompt).linkedInstructions;
  if (linked?.text.includes(PDF_INSTRUCTION_PAGES[0])) {
    return {
      ...result,
      deliverable: 'document',
      title: 'Greenhouse water use proposal',
      body: 'Prepare an irrigation plan for the greenhouse. Include water restrictions and a daily audit of consumption. Explain the validation approach and technology choices.',
    };
  }
  return linked
    ? {
        ...result,
        deliverable: 'document',
        body: 'Prepare an inventory design proposal covering damaged stock and end-of-day balancing. Limit the document to three pages. Explain the validation approach and technology choices.',
      }
    : result;
};

/** Actual reader and commander, with isolated fixture browser contexts. */
export const assignmentSourceBrowserFixture = ({ store, browser, records }) =>
  createAssignmentSourceReader({
    store,
    openSession: async (options) => {
      const context = await browser().newContext();
      const page = await context.newPage();
      const commander = makeBrowserCommander({
        page,
        enableNetworkTracking: false,
        enableNavigationManager: false,
        enableDialogManager: false,
      });
      const record = { options, closed: false };
      records.push(record);
      return {
        page,
        commander,
        close: async () => {
          await commander.destroy();
          await context.close();
          record.closed = true;
        },
      };
    },
  });
