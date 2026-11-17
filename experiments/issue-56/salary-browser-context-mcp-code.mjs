import { readFile } from 'node:fs/promises';
import {
  salaryClarificationAnswer,
  salaryPhrasingAnswer,
} from './salary-clarification-fixture.mjs';

const source = await readFile(
  new URL('./salary-clarification-mcp.mjs', import.meta.url),
  'utf8'
);
const supplied = "      recent: ['Ваши зарплатные ожидания в долларах?'],\n";
const answer = `const expected = '${salaryClarificationAnswer}';`;
if (!source.includes(supplied) || !source.includes(answer)) {
  throw new Error('The shared native clarification inspection changed');
}
process.stdout.write(
  source
    .replace(supplied, '')
    .replace(
      answer,
      `const expected = ${JSON.stringify(salaryPhrasingAnswer)};`
    )
    .trim()
    .replace(/;$/u, '')
);
