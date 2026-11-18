import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createLocalAnswerModel } from '../src/automation/local-answer-model.js';

const fixture = fileURLToPath(
  new URL(
    '../../experiments/issue-56/answer-model-process-fixture.mjs',
    import.meta.url
  )
);
const input = (more = {}) => ({
  prompt: 'Private CV context · 你好',
  system: 'Generic draft instructions',
  schema: { type: 'object' },
  settings: { model: 'sonnet', timeoutMs: 3000 },
  ...more,
});
const service = (mode, options = {}) =>
  createLocalAnswerModel({
    command: 'node',
    prefix: ['--max-old-space-size=64', fixture, mode],
    ...options,
  });

test(
  'native runner uses bounded tool-free flags, private stdin and structured Unicode output',
  { timeout: 5000 },
  async () => {
    const model = service('success');
    try {
      const result = await model.draft(input());
      assert.equal(result.prompt, input().prompt);
      assert.match(result.unicode, /你好/);
      assert.equal(result.args.includes(input().prompt), false);
      for (const flag of [
        '--bare',
        '--no-session-persistence',
        '--no-chrome',
        '--print',
      ]) {
        assert(result.args.includes(flag));
      }
      const args = result.args;
      assert.equal(args[args.indexOf('--tools') + 1], '');
      assert.equal(args[args.indexOf('--disallowedTools') + 1], 'mcp__*');
      assert.equal(args[args.indexOf('--max-turns') + 1], '1');
      assert.equal(args[args.indexOf('--output-format') + 1], 'json');
    } finally {
      await model.stop();
    }
  }
);

test(
  'native runner rejects malformed, nonzero and finite excessive output without exposing stderr',
  { timeout: 10000 },
  async () => {
    for (const [mode, code] of [
      ['invalid', 'answer-model-response'],
      ['exit', 'answer-model-exit'],
      ['overflow', 'answer-model-output'],
      ['stderr', 'answer-model-output'],
    ]) {
      const model = service(mode);
      try {
        await assert.rejects(
          model.draft(input()),
          (error) =>
            error.code === code &&
            !error.message.includes('private-provider-detail')
        );
      } finally {
        await model.stop();
      }
    }
    const missing = createLocalAnswerModel({
      command: 'meta-sovereign-fixture-missing-executable',
    });
    try {
      await assert.rejects(missing.draft(input()), {
        code: 'answer-model-unavailable',
      });
    } finally {
      await missing.stop();
    }
  }
);

test(
  'timeout and stop drain the actual owned child, reject concurrent work and refuse further requests',
  { timeout: 10000 },
  async () => {
    for (const action of ['timeout', 'stop', 'abort']) {
      let child;
      let ready;
      const controller = new AbortController();
      const model = service('wait', {
        start: (...args) => {
          child = spawn(...args);
          ready = new Promise((resolve, reject) => {
            child.stdout.once('data', resolve);
            child.once('error', reject);
            child.once('close', () =>
              reject(new Error('fixture closed before readiness'))
            );
          });
          ready.catch(() => {});
          return child;
        },
      });
      const pending = model.draft(
        input({
          signal: controller.signal,
          settings: { timeoutMs: action === 'timeout' ? 50 : 3000 },
        })
      );
      const rejected = assert.rejects(pending, {
        code:
          action === 'timeout'
            ? 'answer-model-timeout'
            : 'answer-model-stopped',
      });
      try {
        await assert.rejects(model.draft(input()), {
          code: 'answer-model-busy',
        });
        if (action !== 'timeout') {
          await ready;
        }
        if (action === 'stop') {
          await model.stop();
        }
        if (action === 'abort') {
          controller.abort();
        }
        await rejected;
        assert(
          child.exitCode !== null || child.signalCode !== null,
          'child is closed before draft settles'
        );
      } finally {
        await model.stop();
      }
      await assert.rejects(model.draft(input()), {
        code: 'answer-model-stopped',
      });
    }
  }
);

test(
  'oversized prompt is refused before a process is launched',
  { timeout: 5000 },
  async () => {
    const model = service('success', {
      start: () => assert.fail('must not launch'),
    });
    try {
      await assert.rejects(
        model.draft(input({ prompt: 'x'.repeat(128 * 1024 + 1) })),
        { code: 'answer-model-context' }
      );
    } finally {
      await model.stop();
    }
  }
);
