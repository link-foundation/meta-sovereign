import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeFile, access } from 'node:fs/promises';
import {
  createCvTranslationAdapters,
  latestCvLuna,
  parseCvTranslationBatch,
  formalCvTranslationPrompt,
} from '../src/jobs/cv-translation-adapters.js';
import { runCvTranslator } from '../src/jobs/cv-translation-process.js';

const fixture = fileURLToPath(
  new URL(
    '../../experiments/issue-56/cv-translation-process-fixture.mjs',
    import.meta.url
  )
);
const probe = (mode, options = {}) =>
  runCvTranslator(
    process.execPath,
    ['--max-old-space-size=64', fixture, mode],
    options
  );

test('Formal AI literal quoting preserves embedded quotes and paragraphs, refusing ambiguous extraction', () => {
  assert.equal(
    formalCvTranslationPrompt('Программист\nв команде', 'en'),
    'Translate "Программист\nв команде" to English'
  );
  assert.equal(
    formalCvTranslationPrompt('Инженер "ПО"', 'en'),
    'Translate \'Инженер "ПО"\' to English'
  );
  assert.throws(
    () => formalCvTranslationPrompt('Led \'owners\' "team"', 'ru'),
    { code: 'jobs-cv-translation-quoted-input' }
  );
});

test(
  'translator pipes preserve literal private Unicode input and bound output without shell expansion',
  { timeout: 10000 },
  async () => {
    const input = 'Программист $HOME `echo hello`';
    const success = JSON.parse(await probe('success', { input }));
    assert.equal(success.input, input);
    for (const [mode, code] of [
      ['overflow', 'output'],
      ['stderr', 'output'],
      ['exit', 'exit'],
    ]) {
      await assert.rejects(
        probe(mode),
        (error) =>
          error.code === `jobs-cv-translation-${code}` &&
          !error.message.includes('private-translator-detail')
      );
    }
    await assert.rejects(
      runCvTranslator('meta-sovereign-missing-translator', []),
      { code: 'jobs-cv-translation-unavailable' }
    );
  }
);

test(
  'translator timeout and abort await the actual owned child close',
  { timeout: 5000 },
  async () => {
    for (const kind of ['timeout', 'abort']) {
      const controller = new AbortController();
      let child;
      const task = probe('wait', {
        signal: controller.signal,
        timeoutMs: kind === 'timeout' ? 100 : 3000,
        start: (...args) => {
          child = spawn(...args);
          if (kind === 'abort') {
            child.once('spawn', () => controller.abort());
          }
          return child;
        },
      });
      await assert.rejects(task, {
        code: `jobs-cv-translation-${kind === 'abort' ? 'stopped' : 'timeout'}`,
      });
      assert(child.exitCode !== null || child.signalCode !== null);
    }
  }
);

test('Luna resolves newest family version from fresh catalog without substituting another model', () => {
  assert.equal(
    latestCvLuna(
      JSON.stringify({
        models: [
          { slug: 'gpt-6-luna' },
          { slug: 'gpt-6.2-luna' },
          { slug: 'gpt-7-sol' },
        ],
      })
    ),
    'gpt-6.2-luna'
  );
  assert.throws(() => latestCvLuna('{"models":[{"slug":"gpt-9-sol"}]}'));
  for (const raw of ['["one"] trailing', '{}', '[1]', '["one","two"]']) {
    assert.throws(() => parseCvTranslationBatch(raw, 1));
  }
});

test('Haiku and Luna use exact JSON batches; Formal AI uses quoted literal inputs with live lookup', async () => {
  const calls = [];
  const directories = [];
  const run = async (command, args, options = {}) => {
    calls.push({ command, args, ...options });
    if (args[0] === 'debug') {
      return '[{"slug":"gpt-6-luna"}]';
    }
    if (args[0] === '--version') {
      return 'formal-ai 0.355.34';
    }
    directories.push(options.cwd);
    if (command === 'claude') {
      return JSON.stringify({
        result: '["Software engineer"]',
        modelUsage: { 'claude-haiku-5-5': {} },
      });
    }
    if (command === 'codex') {
      await writeFile(
        args[args.indexOf('--output-last-message') + 1],
        '["Software engineer"]'
      );
      return 'progress only';
    }
    return 'Software engineer';
  };
  const adapters = createCvTranslationAdapters({ run });
  const signal = new AbortController().signal;
  const input = { from: 'ru', to: 'en', texts: ['Инженер "ПО"\nв команде'] };
  for (const provider of ['haiku', 'luna', 'formal-ai']) {
    const descriptor = await adapters.resolve(provider, {}, signal);
    const result = await adapters.translate(
      provider,
      descriptor,
      input,
      signal
    );
    assert.equal(result.outputs[0], 'Software engineer');
    if (provider === 'haiku') {
      assert.equal(descriptor.cacheable, false);
      assert.equal(result.model, 'claude-haiku-5-5');
    }
  }
  const haiku = calls.find((call) => call.command === 'claude');
  assert.equal(haiku.args[haiku.args.indexOf('--tools') + 1], '');
  assert(haiku.input.includes(JSON.stringify(input.texts)));
  const luna = calls.find(
    (call) => call.command === 'codex' && call.args[0] === 'exec'
  );
  assert(luna.args.includes('--ignore-user-config'));
  assert.equal(luna.args[luna.args.indexOf('--sandbox') + 1], 'read-only');
  assert.equal(luna.args.at(-1), '-');
  const formal = calls.find(
    (call) => call.command === 'formal-ai' && call.args[0] === 'chat'
  );
  assert.equal(formal.args.at(-1), `Translate '${input.texts[0]}' to English`);
  assert.equal(formal.env.FORMAL_AI_LIVE_API, '1');
  for (const directory of directories) {
    await assert.rejects(access(directory));
  }
});

test('adapter failures remove private directories and reject changed Haiku identities', async () => {
  let directory;
  const adapters = createCvTranslationAdapters({
    run: async (_command, _args, options) => {
      directory = options.cwd;
      return JSON.stringify({
        result: '["Engineer"]',
        modelUsage: { 'claude-sonnet-5': {} },
      });
    },
  });
  await assert.rejects(
    adapters.translate(
      'haiku',
      { model: 'claude-haiku-5-5', cacheable: true },
      { from: 'ru', to: 'en', texts: ['Инженер'] },
      new AbortController().signal
    )
  );
  await assert.rejects(access(directory));
});
