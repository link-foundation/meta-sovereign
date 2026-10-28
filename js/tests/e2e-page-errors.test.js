import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  watchChatPages,
  screenshotChatPages,
} from './helpers/e2e-page-errors.mjs';

const base = 'http://127.0.0.1:49743';
const accessError = (url = `${base}/api/status?probe=1`) =>
  new Error(`Fetch API cannot load ${url} due to access control checks.`);
const fixture = (options = {}) => {
  const context = new EventEmitter();
  const pages = [];
  context.pages = () => pages;
  const newPage = () => {
    const page = new EventEmitter();
    pages.push(page);
    context.emit('page', page);
    return page;
  };
  const first = newPage();
  const errors = [];
  watchChatPages(context, { base, engine: 'webkit', errors, ...options });
  return { first, newPage, errors };
};

test('reopened pages apply the same WebKit policy and retain genuine errors', () => {
  const { first, newPage, errors } = fixture();
  first.emit('pageerror', accessError());
  first.emit(
    'pageerror',
    `Fetch API cannot load http: /127.0.0.1:49743/api/status?probe=1 due to access control checks.`
  );
  const reopened = newPage();
  reopened.emit('pageerror', accessError());
  reopened.emit('pageerror', new Error('real application failure'));
  assert.deepEqual(errors, ['Error: real application failure']);
});

test('access-control errors from another origin or engine remain failures', () => {
  for (const engine of ['chromium', 'firefox', 'webkit']) {
    const { first, errors } = fixture({ engine });
    const error = accessError(
      engine === 'webkit'
        ? 'http://127.0.0.1:49744/api/status?probe=1'
        : undefined
    );
    first.emit('pageerror', error);
    assert.deepEqual(errors, [String(error)], engine);
  }
});

test('malformed URLs and real unhandled fetch rejections remain failures', () => {
  const { first, errors } = fixture();
  const failures = [
    accessError('not-a-url'),
    new TypeError('Load failed'),
    new Error('Failed to fetch'),
  ];
  for (const error of failures) {
    first.emit('pageerror', error);
  }
  assert.deepEqual(errors, failures.map(String));
});

test('browser dialogs are rejected and dismissed on reopened pages', async () => {
  const { newPage, errors } = fixture();
  let dismissed = false;
  newPage().emit('dialog', {
    message: () => 'unexpected confirm',
    dismiss: async () => {
      dismissed = true;
    },
  });
  assert.deepEqual(errors, ['browser dialog: unexpected confirm']);
  assert.equal(dismissed, true);
});

test('handled WebKit diagnostics have opt-in tracing', () => {
  const trace = [];
  const { newPage, errors } = fixture({ trace: (event) => trace.push(event) });
  newPage().emit('pageerror', accessError());
  assert.deepEqual(errors, []);
  assert.deepEqual(trace, ['handled WebKit same-origin fetch diagnostic']);
});

test('native WebKit display-form URLs retain the exact origin boundary', () => {
  const { newPage, errors } = fixture();
  const page = newPage();
  page.emit(
    'pageerror',
    accessError('http: /127.0.0.1:49743/api/status?probe=1')
  );
  const foreign = accessError('http: /127.0.0.1:49744/api/status?probe=1');
  page.emit('pageerror', foreign);
  assert.deepEqual(errors, [String(foreign)]);
});

test('failure screenshot uses reopened pages and continues after a capture fails', async () => {
  const captures = [];
  const reports = [];
  const page = (closed, screenshot) => ({ isClosed: () => closed, screenshot });
  const context = {
    pages: () => [
      page(true, () => assert.fail('closed original page')),
      page(false, async () => {
        throw new Error('page vanished');
      }),
      page(false, async ({ path }) => captures.push(path)),
    ],
  };
  await screenshotChatPages(context, {
    artifactDir: 'artifacts/browser',
    name: 'history',
    engine: 'webkit',
    report: (message) => reports.push(message),
  });
  assert.equal(captures.length, 1);
  assert.match(captures[0], /ms-e2e-history-webkit-1\.png$/);
  assert.deepEqual(reports, ['[e2e-history] screenshot failed: page vanished']);
});
