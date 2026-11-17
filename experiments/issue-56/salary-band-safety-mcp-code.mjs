import { readFileSync } from 'node:fs';
import { bandSalary } from './salary-band-safety-fixture.mjs';

// Feed the same bounded fixture configuration into the independent MCP page.
const code = readFileSync(
  new URL('./salary-band-safety-mcp.mjs', import.meta.url),
  'utf8'
)
  .trim()
  .replace(/;$/u, '');
const input = { source: 'hh', chat: '7', salary: bandSalary };
console.log(`async (page) => (${code})(page, ${JSON.stringify(input)})`);
