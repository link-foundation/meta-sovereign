import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import {
  formReportMarkdown,
  formReportOutput,
} from '../src/forms/report-markdown.js';
import { createFormReportWriter } from '../src/forms/report-file.js';
import { createFormsCommands } from '../src/cli/forms-commands.js';
import { FormReviewJournal } from '../src/web/form-review-journal.js';
import { FormReportFile } from '../src/web/form-report-download.js';
import { availableLocales } from '../src/web/i18n.js';
import { renderInLocale } from './util-render.js';
import { formChoiceEnvironment } from './helpers/forms-choice-fixture.mjs';

test(
  'Markdown distinguishes observed values, source evidence and open questions while escaping form text',
  { timeout: 5000 },
  async () => {
    const env = await formChoiceEnvironment();
    try {
      const plan = await env.plan();
      plan.fields[0].label = '[run](javascript:bad) <script>bad</script>';
      plan.fields[0].description = 'Line one\n# Heading';
      plan.fields.push({
        id: 'open',
        label: 'Unknown',
        frame: 'frame-1',
        type: 'text',
        value: '',
        answer: { source: 'unresolved', complete: false, reason: 'no-answer' },
      });
      const text = formReportMarkdown(plan);
      assert(text.includes('Current value: hi'));
      assert(text.includes('Proposed answer source: exact'));
      assert(text.includes('Preferred language'));
      assert(text.includes('synthetic'));
      assert(text.includes('Question similarity: 1'));
      assert(text.includes('open / no\\-answer'));
      assert(!text.includes('<script>'));
      assert(!text.includes('[run](javascript:bad)'));
      assert(text.includes('> \\# Heading'));
      assert.throws(() => formReportOutput('html'), /--format/);
      assert.equal(JSON.parse(formReportOutput()(plan)).mode, 'answer-plan');
      plan.reportFile = { state: 'failed', code: 'form-report-write' };
      assert(formReportOutput('markdown')(plan).includes('Report file:'));
      plan.fields[0].indeterminate = true;
      assert(formReportMarkdown(plan).includes('Current value: Mixed'));
    } finally {
      await env.reader.stop();
    }
  }
);

test(
  'report writer creates distinct private Markdown files and reports write refusal without overwriting',
  { timeout: 5000 },
  async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'forms-markdown-')
    );
    const env = await formChoiceEnvironment();
    try {
      const plan = await env.plan();
      const writer = createFormReportWriter({ directory });
      const first = await writer(plan);
      const second = await writer(plan);
      assert.equal(first.state, 'saved');
      assert.notEqual(first.path, second.path);
      assert.equal(
        await fs.readFile(first.path, 'utf8'),
        formReportMarkdown(plan)
      );
      if (process.platform !== 'win32') {
        assert.equal((await fs.stat(first.path)).mode & 0o777, 0o600);
      }
      const refused = await createFormReportWriter({ directory: first.path })(
        plan
      );
      assert.equal(refused.state, 'failed');
      assert.equal(
        await fs.readFile(first.path, 'utf8'),
        formReportMarkdown(plan)
      );
    } finally {
      await env.reader.stop();
      await fs.rm(directory, { recursive: true, force: true });
    }
  }
);

test(
  'interactive CLI exports captured provenance in Markdown and validates format before opening a store',
  { timeout: 5000 },
  async () => {
    const env = await formChoiceEnvironment({ reportWriter: null });
    await env.reader.stop();
    let opened = 0;
    const commands = createFormsCommands({
      ...env.options,
      openStore: async () => {
        opened++;
        return env.options.store;
      },
      async *reviewInput() {
        yield 'plan form-1';
        yield 'history form-1';
        yield 'quit';
      },
    });
    const output = [];
    await assert.rejects(
      commands['forms-review'](
        { url: env.report.url, format: 'html' },
        () => {}
      ),
      /--format/
    );
    assert.equal(opened, 0);
    assert.equal(
      await commands['forms-review'](
        {
          url: env.report.url,
          format: 'markdown',
          'profile-id': env.profile.id,
        },
        (line) => output.push(line)
      ),
      0
    );
    assert(output.some((line) => line.startsWith('# Form inspection')));
    assert(
      output.some(
        (line) =>
          line.includes('# Form review checkpoints') &&
          line.includes('Saved questions:')
      )
    );
    const json = [];
    await commands['forms-review']({ url: env.report.url }, (line) =>
      json.push(line)
    );
    assert(
      json.every((line) => !line.includes('\n')),
      'interactive JSON remains one object per line'
    );
    assert(
      json
        .map((line) => JSON.parse(line))
        .some((item) => item.mode === 'review-journal')
    );
  }
);

test('journal scope, checkpoint controls, downloads and save failures are translated in every locale', () => {
  const report = {
    mode: 'review-journal',
    coverage: 'partial',
    omittedCheckpoints: 1,
    checkpoints: [
      {
        sequence: 2,
        action: 'apply',
        capturedAt: '2026-11-10T16:00:00Z',
        report: { title: '<Past page>', fields: [] },
      },
    ],
  };
  assert(
    formReportMarkdown(report).includes(
      'Checkpoint captured: 2026\\-11\\-10T16:00:00Z'
    ),
    'capture time stays distinct from the last reviewed snapshot time'
  );
  for (const locale of availableLocales) {
    const html = renderInLocale(
      locale.id,
      React.createElement('div', null, [
        React.createElement(FormReviewJournal, {
          key: 'journal',
          report,
          Report: () => null,
        }),
        React.createElement(FormReportFile, {
          key: 'saved',
          file: { state: 'saved', path: '<private>/report.md' },
        }),
        React.createElement(FormReportFile, {
          key: 'failed',
          file: { state: 'failed' },
        }),
      ])
    );
    assert(
      !html.includes('forms.'),
      `all journal text translated in ${locale.id}`
    );
    assert(html.includes('&lt;Past page&gt;'));
    assert(html.includes('data-form-checkpoint="2"'));
    assert(html.includes('data-action="download-form-markdown"'));
    assert(html.includes('data-form-report-file="failed"'));
    assert(!html.includes('data-action="apply-form-plan"'));
  }
});
