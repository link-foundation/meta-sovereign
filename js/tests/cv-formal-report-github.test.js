import test from 'node:test';
import assert from 'node:assert/strict';
import { createFormalReportGithub } from '../src/cv/formal-report-github.js';

const issue = {
  number: 42,
  state: 'open',
  html_url: 'https://github.com/link-assistant/formal-ai/issues/42',
};
test('GitHub adapter reads all search/comment pages, including comment markers, through bounded private process input', async () => {
  const calls = [];
  const signal = new AbortController().signal;
  const github = createFormalReportGithub({
    run: async (executable, args, options) => {
      calls.push({ executable, args, options });
      if (args.includes('search/issues')) {
        return JSON.stringify([
          { total_count: 2, incomplete_results: false, items: [issue] },
          {
            total_count: 2,
            incomplete_results: false,
            items: [
              {
                ...issue,
                number: 43,
                html_url: issue.html_url.replace('42', '43'),
              },
            ],
          },
        ]);
      }
      return JSON.stringify([
        [
          {
            id: 77,
            body: 'Previous evidence',
            html_url: `${issue.html_url}#issuecomment-77`,
            user: { login: 'fixture-owner' },
          },
        ],
        [],
      ]);
    },
  });
  assert.equal((await github.search('marker', signal)).length, 2);
  assert.equal((await github.comments(42, signal)).length, 1);
  assert.ok(
    calls.every(
      (call) =>
        call.executable === 'gh' &&
        call.args.includes('--paginate') &&
        call.args.includes('--slurp') &&
        call.options.signal === signal
    )
  );
  assert.ok(
    calls[0].args.includes(
      'q=repo:link-assistant/formal-ai is:issue "marker" in:body,comments'
    )
  );
});

test('incomplete search, foreign issues and forged comment identities fail closed', async () => {
  for (const page of [
    { total_count: 1, incomplete_results: true, items: [issue] },
    { total_count: 2, incomplete_results: false, items: [issue] },
    {
      total_count: 1,
      incomplete_results: false,
      items: [
        { ...issue, html_url: 'https://github.com/foreign/repo/issues/42' },
      ],
    },
  ]) {
    const github = createFormalReportGithub({
      run: async () => JSON.stringify([page]),
    });
    await assert.rejects(github.search('marker', new AbortController().signal));
  }
  const github = createFormalReportGithub({
    run: async () =>
      JSON.stringify([
        [
          {
            id: 77,
            body: 'Text',
            user: { login: 'owner' },
            html_url: `${issue.html_url}#issuecomment-78`,
          },
        ],
      ]),
  });
  await assert.rejects(github.comments(42, new AbortController().signal));
});

test('GitHub writes use one structured stdin body, fixed endpoints and no shell interpolation or automatic retry', async () => {
  const calls = [];
  const github = createFormalReportGithub({
    run: async (executable, args, options) => {
      calls.push({ executable, args, options });
      return JSON.stringify({
        html_url: issue.html_url,
        body: JSON.parse(options.input).body,
      });
    },
  });
  const body = 'Workplace `literal` $(literal)\nSecond paragraph.';
  for (const operation of ['create', 'comment', 'update-comment']) {
    await github.write(
      { operation, title: 'Translation fails', body, issue: 42, comment: 77 },
      new AbortController().signal
    );
  }
  assert.equal(calls.length, 3);
  assert.ok(
    calls.every(
      (call) =>
        !call.args.some((arg) => arg.includes('Workplace')) &&
        JSON.parse(call.options.input).body === body
    )
  );
  assert.ok(calls[2].args.includes('PATCH'));
  assert.ok(
    calls[2].args.includes('repos/link-assistant/formal-ai/issues/comments/77')
  );
  await assert.rejects(github.write({ operation: 'delete', issue: 42 }));
  assert.equal(calls.length, 3);
});
