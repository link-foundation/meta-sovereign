import { readFileSync } from 'node:fs';
import { mcpInspectionCode } from './mcp-inspection-code.mjs';
import { bandSalary } from './salary-band-safety-fixture.mjs';

/** Compose repository-owned probes with the shared escaped fixture input. */
export const printSalaryMcpCode = (name, salary = bandSalary) => {
  const inspect = readFileSync(
    new URL(`./${name}-mcp.mjs`, import.meta.url),
    'utf8'
  )
    .trim()
    .replace(/;$/u, '');
  console.log(mcpInspectionCode(inspect, { source: 'hh', chat: '7', salary }));
};
