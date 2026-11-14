import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { mcpInspectionCode } from '../../experiments/issue-56/mcp-inspection-code.mjs';

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
