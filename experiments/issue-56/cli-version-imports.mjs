import { observeCliImports } from './cli-import-observation.mjs';

const result = await observeCliImports(async (runCli) => {
  const output = [];
  const codes = [];
  for (const flag of ['--version', '-v', 'version']) {
    codes.push(await runCli([flag], { log: (line) => output.push(line) }));
  }
  return { codes, output };
});
console.log(JSON.stringify(result));
