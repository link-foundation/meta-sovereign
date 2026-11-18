// Finite parser comparison; supplied arguments are synthetic and contain no secrets.
import { yargs } from 'lino-arguments';
import { parseArgs } from '../../js/src/cli/lino-args.js';

const options = {
  'parse-numbers': false,
  'parse-positional-numbers': false,
  'camel-case-expansion': false,
  'dot-notation': false,
  'boolean-negation': false,
  'duplicate-arguments-array': false,
  'short-option-groups': false,
  'unknown-options-as-args': true,
};
const inputs = [
  ['start', '--port=08787', '--confirm', '--name', 'fixture'],
  ['--auto=false', '--no-auto', '--empty=', '--auto=true'],
  ['--title', 'two words', '--value=-1', '0042', '-h'],
  ['--', '--confirm', '--store=fixture'],
  ['--__proto__', 'unsafe', '--constructor', 'unsafe', '--toString=unsafe'],
  ['--name', '-word', '--flag', 'false'],
];
for (const input of inputs) {
  const parser = yargs(input)
    .help(false)
    .version(false)
    .exitProcess(false)
    .parserConfiguration(options);
  for (const token of input.slice(
    0,
    input.indexOf('--') < 0 ? input.length : input.indexOf('--')
  )) {
    if (token.startsWith('--')) {
      parser.option(token.slice(2).split('=')[0], {});
    }
  }
  try {
    const parsed = parser.parseSync();
    delete parsed.$0;
    console.log(
      JSON.stringify({ input, adapter: parseArgs(input), library: parsed })
    );
  } catch (error) {
    console.log(JSON.stringify({ input, error: error.name }));
  }
}
