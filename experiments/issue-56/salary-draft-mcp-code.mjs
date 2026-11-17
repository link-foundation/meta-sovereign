import { readFile } from 'node:fs/promises';
import { salaryClarificationAnswer } from './salary-clarification-fixture.mjs';

/** Reuse the native inspect/prefill receipt without caller-supplied history. */
export const salaryDraftMcpCode = async (expected) => {
  const source = await readFile(
    new URL('./salary-clarification-mcp.mjs', import.meta.url),
    'utf8'
  );
  const supplied = "      recent: ['Ваши зарплатные ожидания в долларах?'],\n";
  const answer = `const expected = '${salaryClarificationAnswer}';`;
  if (!source.includes(supplied) || !source.includes(answer)) {
    throw new Error('The shared native clarification inspection changed');
  }
  return source
    .replace(supplied, '')
    .replace(answer, `const expected = ${JSON.stringify(expected)};`)
    .trim()
    .replace(/;$/u, '');
};
