import test from 'node:test';
import assert from 'node:assert/strict';
import { cvWorkplaceEditorUrl } from '../src/jobs/cv-workplace-open.js';
import { cvWorkplaceOpenFixture } from '../../experiments/issue-56/cv-workplace-open-fixture.mjs';

test('native workplace URLs bind the exact record and optional resume context', () => {
  const base = 'https://hh.ru/profile/edit/experience/123';
  for (const suffix of [
    '',
    '?resumeFrom=abc123&hhtmFrom=resume',
    '?hhtmFrom=resume',
  ]) {
    assert.equal(cvWorkplaceEditorUrl(base + suffix, '123', 'abc123'), true);
  }
  for (const suffix of [
    '4',
    '/',
    '#draft',
    '?resumeFrom=other',
    '?resumeFrom=abc123&resumeFrom=abc123',
    '?next=save',
    '?hhtmFrom=other',
  ]) {
    assert.equal(cvWorkplaceEditorUrl(base + suffix, '123', 'abc123'), false);
  }
  assert.equal(
    cvWorkplaceEditorUrl(base.replace('hh.ru', 'other.test'), '123', 'abc123'),
    false
  );
});

test('an already open exact record is preserved without navigation or list inspection', async () => {
  const f = cvWorkplaceOpenFixture({
    url: 'https://hh.ru/profile/edit/experience/123?resumeFrom=abc123',
  });
  await f.run();
  assert.deepEqual(f.events, []);
});

test('explicit preparation opens the full list and clicks its unique ready native control', async () => {
  const f = cvWorkplaceOpenFixture();
  await f.run();
  assert.deepEqual(f.events, [
    'opening',
    ['goto', f.list],
    ['handle', 'native-list-controls', 3],
    'click',
    'dispose',
  ]);
  assert.match(f.url(), /experience\/123\?resumeFrom=abc123/u);
});

test('an open workplace/About draft, dialog, challenge or oversized page blocks navigation', async () => {
  for (const [state, code] of [
    [{ open: true }, 'draft'],
    [{ dialogs: true }, 'draft'],
    [{ challenge: true }, 'page'],
    [{ overflow: true }, 'draft'],
  ]) {
    const f = cvWorkplaceOpenFixture({ state: () => state });
    await assert.rejects(f.run(), { code: `jobs-cv-${code}` });
    assert.deepEqual(f.events, []);
  }
});

test('an owner draft opened while the durable opening phase is stored survives without navigation', async () => {
  let draft = false;
  const f = cvWorkplaceOpenFixture({
    phase: () => {
      draft = true;
    },
    state: () => ({ open: draft }),
  });
  await assert.rejects(f.run(), { code: 'jobs-cv-draft' });
  assert.deepEqual(f.events, ['opening']);
});

test('a changed navigation destination, duplicate match or missing handler never clicks', async () => {
  for (const [options, code] of [
    [{ redirect: 'https://hh.ru/resume/other' }, 'page'],
    [
      {
        state: () => ({
          candidates: [
            { index: 1, ready: true },
            { index: 2, ready: true },
          ],
        }),
      },
      'baseline',
    ],
    [
      { state: () => ({ candidates: [{ index: 1, ready: false }] }) },
      'hydration',
    ],
    [{ state: () => ({ candidates: [] }) }, 'hydration'],
  ]) {
    const f = cvWorkplaceOpenFixture({ ...options, readinessMs: 100 });
    await assert.rejects(f.run(), { code: `jobs-cv-${code}` });
    assert.equal(f.events.includes('click'), false);
  }
});

test('a list already open can hydrate before its single native click', async () => {
  const f = cvWorkplaceOpenFixture({
    url: 'https://hh.ru/profile/edit/experience?resumeFrom=abc123&hhtmFrom=resume',
    state: ({ reads }) => ({ candidates: [{ index: 3, ready: reads > 3 }] }),
  });
  await f.run();
  assert.equal(f.events.filter((event) => event === 'click').length, 1);
  assert.equal(
    f.events.some((event) => Array.isArray(event) && event[0] === 'goto'),
    false
  );
});

test('replaced or changed list controls stop without clicking and dispose the handle', async () => {
  for (const options of [
    { connected: false },
    {
      state: ({ reads }) => ({
        candidates: [{ index: reads > 3 ? 4 : 3, ready: true }],
      }),
    },
  ]) {
    const f = cvWorkplaceOpenFixture(options);
    await assert.rejects(f.run(), { code: 'jobs-cv-draft' });
    assert.equal(f.events.includes('click'), false);
    assert.equal(f.events.at(-1), 'dispose');
  }
});

test('a wrong record opened by the native control is never treated as the reviewed editor', async () => {
  const f = cvWorkplaceOpenFixture({
    clickedUrl: 'https://hh.ru/profile/edit/experience/456',
  });
  await assert.rejects(f.run(), /Wrong native destination/u);
  assert.equal(f.events.at(-1), 'dispose');
});

test('cancellation after opening the list prevents a native click', async () => {
  const f = cvWorkplaceOpenFixture({
    check: (events) => {
      if (events.some((event) => Array.isArray(event) && event[0] === 'goto')) {
        throw new Error('Cancelled by owner');
      }
    },
  });
  await assert.rejects(f.run(), /Cancelled by owner/u);
  assert.equal(f.events.includes('click'), false);
});
