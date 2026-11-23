import { yargs } from 'lino-arguments';

const reserved = new Set([
  ...Object.getOwnPropertyNames(Object.prototype),
  'prototype',
  '_',
  '$0',
]);

const invalid = () =>
  Object.assign(new Error('Invalid command arguments.'), {
    code: 'INVALID_CLI_ARGUMENTS',
  });

// Existing commands own option validation and expect kebab-case keys, string
// values (including "false" and numbers), true for bare flags and last value wins.
// Discover only option names; lino-arguments' exported parser handles the values,
// positionals and end-of-options marker. Single-dash words remain literal data.
const prepareArguments = (argv) => {
  const names = new Set();
  const values = [...argv];
  for (let i = 0; i < values.length; i += 1) {
    const token = values[i];
    if (token === '--') {
      break;
    }
    if (!token.startsWith('--')) {
      continue;
    }
    const name = token.slice(2).split('=', 1)[0];
    if (!name || reserved.has(name)) {
      throw invalid();
    }
    names.add(name);
    const next = values[i + 1];
    if (
      !token.includes('=') &&
      next?.startsWith('-') &&
      !next.startsWith('--')
    ) {
      values.splice(i, 2, `${token}=${next}`);
    }
  }
  return { names, values };
};

export const parseArgs = (argv) => {
  try {
    const { names, values } = prepareArguments(argv);
    const parser = yargs(values)
      .help(false)
      .version(false)
      .exitProcess(false)
      .fail(() => {
        throw invalid();
      })
      .parserConfiguration({
        'parse-numbers': false,
        'parse-positional-numbers': false,
        'camel-case-expansion': false,
        'dot-notation': false,
        'boolean-negation': false,
        'duplicate-arguments-array': false,
        'short-option-groups': false,
        'unknown-options-as-args': true,
      });
    for (const name of names) {
      parser.option(name, {});
    }
    const { $0: _script, ...result } = parser.parseSync();
    return result;
  } catch {
    // Parser diagnostics can quote option values. Never echo a credential.
    throw invalid();
  }
};

export const typedFlag = (args, key, kind) => {
  const value = args[key];
  if (value === undefined) {
    return undefined;
  }
  if (kind === 'boolean' && [true, false, 'true', 'false'].includes(value)) {
    return value === true || value === 'true';
  }
  if (kind === 'number' && /^\d+$/u.test(String(value))) {
    return Number(value);
  }
  throw new Error(`--${key} must be a ${kind}`);
};
