import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../src/cli/lino-args.js';
import { runCliCommand } from '../src/cli/command-runner.js';

test(
  'CLI preserves existing option types, spelling and last-value precedence',
  { timeout: 5000 },
  () => {
    assert.deepEqual(
      parseArgs([
        'status',
        '0042',
        '--port=08787',
        '--enabled=false',
        '--no-enabled',
        '--empty=',
        '--display-name',
        'Имя with spaces',
        '--display-name=last',
        '--nested.name=literal',
        '--confirm',
        '-h',
      ]),
      {
        _: ['status', '0042'],
        port: '08787',
        enabled: 'false',
        'no-enabled': true,
        empty: '',
        'display-name': 'last',
        'nested.name': 'literal',
        confirm: '-h',
      }
    );
    assert.deepEqual(
      parseArgs(['-h', '--value', '-word', '--count', '-1', '--bare']),
      {
        _: ['-h'],
        value: '-word',
        count: '-1',
        bare: true,
      }
    );
    assert.deepEqual(parseArgs(['--enabled=true', '--enabled']), {
      _: [],
      enabled: true,
    });
  }
);

test(
  'end-of-options keeps flag-shaped data out of command controls',
  { timeout: 5000 },
  async () => {
    let received;
    const code = await runCliCommand(
      [
        'fixture',
        '--store=fixture',
        '--',
        '--confirm',
        '--store=other',
        '--__proto__=data',
      ],
      async (args) => {
        received = args;
        return 0;
      }
    );
    assert.equal(code, 0);
    assert.deepEqual(received, {
      _: ['--confirm', '--store=other', '--__proto__=data'],
      store: 'fixture',
    });
    assert.equal(received.confirm, undefined);
  }
);

test(
  'reserved option names fail without logging supplied credential data or invoking a consumer',
  { timeout: 5000 },
  async () => {
    for (const key of [
      '__proto__',
      'constructor',
      'prototype',
      'toString',
      '_',
      '$0',
    ]) {
      const output = [];
      let invoked = false;
      const code = await runCliCommand(
        ['fixture', `--${key}=fixture_private_value_123`],
        () => {
          invoked = true;
        },
        { log: (text) => output.push(text) }
      );
      assert.equal(code, 1);
      assert.equal(invoked, false);
      assert.deepEqual(output, ['Invalid command arguments.']);
    }
    assert.equal({}.fixture, undefined);
  }
);

test(
  'repeated parsing has no option leakage and never mutates supplied arguments',
  { timeout: 5000 },
  () => {
    const input = Object.freeze(['--title', '-word', '--', '--confirm']);
    assert.deepEqual(parseArgs(input), { _: ['--confirm'], title: '-word' });
    assert.deepEqual(parseArgs(['--confirm']), { _: [], confirm: true });
    assert.deepEqual(parseArgs([]), { _: [] });
    assert.deepEqual(input, ['--title', '-word', '--', '--confirm']);
  }
);
