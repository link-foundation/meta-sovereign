import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { mcpInspectionCode } from '../../experiments/issue-56/mcp-inspection-code.mjs';
import { applicationChatsMcpCode } from '../../experiments/issue-56/application-chats-mcp.mjs';
import { applicationAnswerMcpRunner } from '../../experiments/issue-56/application-answer-context-mcp-runner.mjs';
import { linkedinPositionReviewInspectionCode } from '../../experiments/issue-56/linkedin-position-review-inspect.mjs';

test('MCP inspection keeps script terminators and line separators inside fixture data', async () => {
  const fixture = {
    base: '</script><script>globalThis.injected = true</script>\u2028\u2029',
    control: 'backslash\\ and quote\'"',
    screenshots: '/tmp/fixture with spaces',
  };
  const code = mcpInspectionCode((_page, data) => data, fixture);
  assert.doesNotMatch(code, /[<\u2028\u2029]/u);
  assert.ok(code.includes('\\u003e'));
  const sandbox = {};
  const result = await runInNewContext(`(${code})`, sandbox)(null);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), fixture);
  assert.equal(sandbox.injected, undefined);
});

test('application chat MCP metadata stays escaped and reaches navigation unchanged', async () => {
  const base = '</script><script>globalThis.injected=true</script>\u2028\u2029';
  const code = applicationChatsMcpCode({ base, control: 'literal\\path' });
  assert.doesNotMatch(code, /<\/script|[\u2028\u2029]/u);
  assert.ok(code.includes('\\u003e'));
  const sandbox = {};
  const stop = new Error('bounded navigation probe complete');
  let visited;
  const page = {
    on() {},
    async setViewportSize() {},
    async goto(url) {
      visited = url;
      throw stop;
    },
  };
  await assert.rejects(
    runInNewContext(`(${code})`, sandbox)(page),
    (error) => error === stop
  );
  assert.equal(visited, base);
  assert.equal(sandbox.injected, undefined);
});

test('MCP inspection supplies its trusted callback without evaluating fixture data', async () => {
  const fixture = { value: '</script>\u2028' };
  const code = mcpInspectionCode(
    (_page, data, check) => check(data),
    fixture,
    (data) => ({ value: data.value, checked: true })
  );
  const result = await runInNewContext(`(${code})`, {})(null);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    ...fixture,
    checked: true,
  });
});

test('LinkedIn position inspection accepts its configuration as data', async () => {
  const beforeBundle = '/tmp/preview </script> bundle.js';
  const base = 'https://example.test/profile\u2028preview';
  const code = linkedinPositionReviewInspectionCode({
    base,
    beforeBundle,
    planRequestId: 'private-review',
  });
  assert.doesNotMatch(code, /<\/script|[\u2028\u2029]/u);
  const element = {
    locator: () => element,
    first: () => element,
    click: async () => {},
    waitFor: async () => {},
    count: async () => 0,
  };
  const page = {
    locator: () => element,
    async route(_matcher, handle) {
      await handle({
        async fulfill({ path }) {
          assert.equal(path, beforeBundle);
        },
      });
    },
    async setViewportSize() {},
    async goto(url) {
      assert.equal(url, `${base}/#/cv`);
    },
    async evaluate(_setPreferences, data) {
      assert.equal(data.planRequestId, 'private-review');
    },
    async reload() {},
  };
  const result = await runInNewContext(`(${code})`, {})(page);
  assert.equal(result.before, true);
});

for (const terminator of ['', ';', ';\n// retained final comment']) {
  test(`application answer MCP accepts trusted function source ending ${JSON.stringify(terminator)}`, async () => {
    const fixture =
      'quote\'"; backslash\\; </script><script>globalThis.injected=true</script>\u2028\u2029';
    const work = `(page, controls, configure, fixture) => ({ value: fixture,
      page, controls: typeof controls, configure: typeof configure })${terminator}`;
    const code = applicationAnswerMcpRunner(work, fixture);
    assert.doesNotMatch(code, /<\/script|[\u2028\u2029]/u);
    const sandbox = {};
    const result = await runInNewContext(`(${code})`, sandbox)('sentinel');
    assert.deepEqual(JSON.parse(JSON.stringify(result)), {
      value: fixture,
      page: 'sentinel',
      controls: 'function',
      configure: 'function',
    });
    assert.equal(sandbox.injected, undefined);
  });
}

test('MCP fixture objects retain special property names without changing their prototype', async () => {
  const fixture = JSON.parse(
    '{"__proto__":{"injected":true},"constructor":"literal","value":"</script>"}'
  );
  const inspect = (_page, data) => ({
    keys: Object.keys(data),
    own: Object.hasOwn(data, '__proto__'),
    inherited: data.injected ?? null,
    data,
  });
  for (const code of [
    mcpInspectionCode(inspect, fixture),
    applicationAnswerMcpRunner(
      '(page, _controls, _configure, data) => ({ keys: Object.keys(data), own: Object.hasOwn(data, "__proto__"), inherited: data.injected ?? null, data })',
      fixture
    ),
  ]) {
    const result = await runInNewContext(`(${code})`, {})(null);
    assert.deepEqual(JSON.parse(JSON.stringify(result)), {
      keys: ['__proto__', 'constructor', 'value'],
      own: true,
      inherited: null,
      data: fixture,
    });
  }
});

test('application answer MCP preserves work files that do not supply fixture data', async () => {
  const code = applicationAnswerMcpRunner(
    '(_page, controls, configure, data) => [typeof controls, typeof configure, data]'
  );
  const result = await runInNewContext(`(${code})`, {})(null);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), [
    'function',
    'function',
    null,
  ]);
});

test('MCP inspection preserves absent fixture compatibility', async () => {
  const code = mcpInspectionCode((_page, fixture) => fixture);
  assert.equal(await runInNewContext(`(${code})`, {})(null), undefined);
});
