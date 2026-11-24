import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createAssignmentSourceReader } from '../src/assignments/source-reader.js';
import { assignmentSourceReceipt } from '../src/assignments/source.js';
import {
  assignmentPdfFixture,
  PDF_INSTRUCTION_PAGES,
} from '../../experiments/issue-56/assignment-pdf-fixture.mjs';

const requested = 'https://assignments.example.test/start';
const resolved = 'https://instructions.example.test/attachment';

const fixture = (data, status = 200, delayed = false) => {
  const page = new EventEmitter();
  const frame = {};
  const events = [];
  let url;
  let route;
  const emitDownload = () =>
    page.emit('download', {
      url: () => resolved,
      cancel: async () => events.push('download-cancelled'),
    });
  page.mainFrame = () => frame;
  page.waitForEvent = async (event, { timeout }) => {
    assert.equal(delayed, true);
    assert.equal(event, 'download');
    assert.equal(timeout, 1000);
    emitDownload();
  };
  page.context = () => ({
    newPage: async () => ({
      route: async (_matcher, handler) => (route = handler),
      async goto(target) {
        url = target;
        await route({ fulfill: async () => events.push('marker') });
      },
      url: () => url,
      async evaluate(_fn, input) {
        assert.equal(input.url, resolved);
        assert.equal(new URL(url).origin, new URL(resolved).origin);
        return data.toString('base64');
      },
      close: async () => events.push('page-closed'),
    }),
  });
  const read = createAssignmentSourceReader({
    openSession: async (options) => {
      assert.equal(options.slot, 'assignment-source');
      return {
        page,
        commander: {
          async goto() {
            page.emit('response', {
              request: () => ({ isNavigationRequest: () => true }),
              frame: () => frame,
              status: () => (delayed ? 302 : status),
              url: () => (delayed ? requested : resolved),
              headers: () => ({ 'content-type': 'application/pdf' }),
            });
            if (!delayed) {
              emitDownload();
            }
            throw new Error('Download is starting');
          },
          evaluate: async () => assert.fail('PDF viewer is not instructions'),
        },
        close: async () => events.push('session-closed'),
      };
    },
  });
  return { read, events, page };
};

test('PDF navigation reads every text page and freezes a distinct source scope', async () => {
  const { read, events, page } = fixture(assignmentPdfFixture());
  const source = await read(requested);
  assert.equal(source.requestedUrl, requested);
  assert.equal(source.url, resolved);
  assert.equal(source.scope, 'pdf-text-layer');
  assert.equal(source.text, PDF_INSTRUCTION_PAGES.join('\n\n'));
  const { evidence } = await assignmentSourceReceipt(source, requested);
  assert.equal(Object.hasOwn(evidence, 'text'), false);
  const html = await assignmentSourceReceipt(
    { ...source, scope: 'visible-document-text' },
    requested
  );
  assert.notEqual(evidence.fingerprint, html.evidence.fingerprint);
  assert.deepEqual(events, [
    'download-cancelled',
    'marker',
    'page-closed',
    'session-closed',
  ]);
  assert.deepEqual(page.eventNames(), []);
});

test('a delayed owned download binds the final URL before the verified PDF fetch', async () => {
  const { read, events } = fixture(assignmentPdfFixture(), 200, true);
  const source = await read(requested);
  assert.equal(source.url, resolved);
  assert.equal(source.text, PDF_INSTRUCTION_PAGES.join('\n\n'));
  assert.deepEqual(events, [
    'download-cancelled',
    'marker',
    'page-closed',
    'session-closed',
  ]);
});

test('malformed, textless-page and over-budget PDFs refuse without returning partial instructions', async () => {
  for (const data of [
    Buffer.from('Not a PDF'),
    assignmentPdfFixture([PDF_INSTRUCTION_PAGES[0], '']),
    assignmentPdfFixture(Array(21).fill(PDF_INSTRUCTION_PAGES[0])),
    assignmentPdfFixture(Array(9).fill('text '.repeat(800))),
  ]) {
    const { read, events } = fixture(data);
    await assert.rejects(read(requested), {
      code: 'assignment-source-unreadable',
    });
    assert.equal(events.at(-1), 'session-closed');
  }
});

test('a PDF response without success evidence never opens a fetch page', async () => {
  const { read, events } = fixture(assignmentPdfFixture(), 206);
  await assert.rejects(read(requested), {
    code: 'assignment-source-unavailable',
  });
  assert.deepEqual(events, ['download-cancelled', 'session-closed']);
});
