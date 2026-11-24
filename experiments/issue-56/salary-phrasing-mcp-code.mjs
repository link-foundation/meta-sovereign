import { readFile } from 'node:fs/promises';
import {
  salaryClarificationAnswer,
  salaryPhrasingAnswer,
} from './salary-clarification-fixture.mjs';

// Exercise the identical native receipt inspection with this scenario's wording.
const inspection = await readFile(
  new URL('./salary-clarification-mcp.mjs', import.meta.url),
  'utf8'
);
const expected = `const expected = '${salaryClarificationAnswer}';`;
if (!inspection.includes(expected)) {
  throw new Error('The shared clarification inspection changed');
}
process.stdout.write(
  inspection
    .replace(
      expected,
      `const expected = ${JSON.stringify(salaryPhrasingAnswer)};`
    )
    .trim()
    .replace(/;$/u, '')
);
