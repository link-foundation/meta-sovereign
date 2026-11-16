import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { mcpInspectionCode } from '../../experiments/issue-56/mcp-inspection-code.mjs';
import { applicationChatsMcpCode } from '../../experiments/issue-56/application-chats-mcp.mjs';

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
