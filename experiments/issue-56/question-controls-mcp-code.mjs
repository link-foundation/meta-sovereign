import { readFile } from 'node:fs/promises';

// MCP evaluates one function in a VM without an ESM import callback. Compose
// only these repository-owned helpers; never interpolate provider content.
const name = process.argv[2];
if (!['whole-turn', 'pending-turn'].includes(name)) {
  throw new Error('Choose whole-turn or pending-turn.');
}
const setup = await readFile(
  new URL('./question-controls-mcp-setup.mjs', import.meta.url),
  'utf8'
);
const probe = await readFile(
  new URL(`./${name}-mcp.mjs`, import.meta.url),
  'utf8'
);
console.log(`async (page) => {
${setup.replaceAll('export const ', 'const ')}
return await (${probe.trim().replace(/;$/, '')})(page, {
  prepareQuestionBrowserMcp, waitForQuestionPrefill,
});
}`);
