// Issue #29 / R-V13: telemetry must make a failed run debuggable from
// its log alone — which selector missed, which fallback saved it, how
// long each step took, and whether the markup changed under us.

import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect } from 'test-anywhere';

import { createMemoryStore } from '../src/storage/universal.js';
import {
  baselineFromReport,
  combineSinks,
  createJsonlSink,
  createMemorySink,
  createStoreSink,
  createTelemetryRun,
  diffFingerprint,
  fingerprintMarkup,
  redactText,
} from '../src/cv/telemetry.js';

const tick = () => {
  let value = 1_700_000_000_000;
  return () => {
    value += 10;
    return value;
  };
};

const step = {
  action: 'read',
  path: 'basics.name',
  selector: '.page-title__title',
  confidence: 'verified',
};

describe('markup fingerprints', () => {
  it('ignores text edits but notices structural change', () => {
    const before = fingerprintMarkup(
      '<form><input name="title"><button>Save</button></form>'
    );
    const edited = fingerprintMarkup(
      '<form><input name="title"><button>Сохранить</button></form>'
    );
    const restructured = fingerprintMarkup(
      '<form><input name="title"><input name="extra"><button>Save</button></form>'
    );
    expect(before.hash).toBe(edited.hash);
    expect(diffFingerprint(before, edited).changed).toBe(false);
    const drift = diffFingerprint(before, restructured);
    expect(drift.changed).toBe(true);
    expect(drift.reasons.join(' ')).toContain('inputs 1 -> 2');
  });

  it('reports the test ids a platform dropped', () => {
    const before = fingerprintMarkup(
      '<div data-qa="resume-block-title"><span data-qa="title">Dev</span></div>'
    );
    const after = fingerprintMarkup(
      '<div data-qa="resume-block-title"><span class="title">Dev</span></div>'
    );
    const drift = diffFingerprint(before, after);
    expect(drift.removedTestIds).toEqual(['data-qa="title"']);
    expect(drift.reasons.join(' ')).toContain('test ids removed');
  });

  it('counts the interactive surface of a page', () => {
    const print = fingerprintMarkup(
      '<form><textarea></textarea><select></select><button></button></form>',
      { selector: 'form', url: 'https://example.test/edit' }
    );
    expect(print.forms).toBe(1);
    expect(print.inputs).toBe(2);
    expect(print.buttons).toBe(1);
    expect(print.selector).toBe('form');
    expect(print.url).toBe('https://example.test/edit');
  });
});

describe('redaction', () => {
  it('replaces personal data with typed placeholders', () => {
    expect(redactText('write to anna@example.com please')).toBe(
      'write to <email> please'
    );
    expect(redactText('call +7 999 123-45-67 now')).toBe('call <phone> now');
    expect(redactText('Bearer abcdefghijklmnopqrstuvwxyz012345')).toContain(
      '<token>'
    );
  });

  it('redacts values nested inside logged events', async () => {
    const sink = createMemorySink();
    const run = createTelemetryRun({ platform: 'hh', sink, now: tick() });
    await run.step(step, 0, async (report) => {
      await report.read('basics.email', { value: 'anna@example.com' });
      return {};
    });
    const [read] = sink.filter('value.read');
    expect(read.value.value).toBe('<email>');
  });
});

describe('telemetry runs', () => {
  it('records the full lifecycle of a step with timings', async () => {
    const sink = createMemorySink();
    const run = createTelemetryRun({
      platform: 'habr-career',
      mode: 'read',
      sink,
      now: tick(),
    });
    await run.start({ url: 'https://career.habr.com/anna' });
    const result = await run.step(step, 0, async (report) => {
      await report.fallback('.page-title__title', 'h1');
      await report.read('basics.name', 'Anna');
      return { value: 'Anna' };
    });
    const report = await run.finish({ fields: 1 });

    expect(result.value).toBe('Anna');
    expect(sink.events.map((event) => event.type)).toEqual([
      'run.start',
      'step.start',
      'selector.fallback',
      'value.read',
      'step.ok',
      'run.finish',
    ]);
    expect(sink.filter('step.ok')[0].durationMs).toBeGreaterThan(0);
    expect(sink.filter('step.start')[0].step).toBe('0:read basics.name');
    expect(report.counts['step.ok']).toBe(1);
    expect(report.problems).toEqual([]);
    expect(report.durationMs).toBeGreaterThan(0);
  });

  it('keeps the error and the surrounding events when a step throws', async () => {
    const sink = createMemorySink();
    const run = createTelemetryRun({ platform: 'topcv', sink, now: tick() });
    let caught = '';
    try {
      await run.step(step, 3, async () => {
        throw new Error('selector .headline not found');
      });
    } catch (error) {
      caught = error.message;
    }
    const report = await run.finish();
    expect(caught).toBe('selector .headline not found');
    expect(sink.filter('step.error')[0].message).toContain('.headline');
    expect(report.problems[0]).toContain('3:read basics.name');
  });

  it('flags markup drift against the previous run and feeds the next one', async () => {
    const sink = createMemorySink();
    const first = createTelemetryRun({ platform: 'hh', sink, now: tick() });
    await first.snapshot(
      'resume',
      '<div data-qa="resume-block-title"><input></div>'
    );
    const firstReport = await first.finish();

    const second = createTelemetryRun({
      platform: 'hh',
      sink: createMemorySink(),
      now: tick(),
      baseline: baselineFromReport(firstReport),
    });
    const { drift } = await second.snapshot(
      'resume',
      '<div><span></span></div>'
    );
    const secondReport = await second.finish();

    expect(drift.changed).toBe(true);
    expect(secondReport.problems[0]).toContain('markup changed at resume');
    expect(secondReport.counts['markup.changed']).toBe(1);
  });

  it('skips steps explicitly instead of silently', async () => {
    const sink = createMemorySink();
    const run = createTelemetryRun({ platform: 'naukri', sink, now: tick() });
    await run.skip(step, 2, 'no value for basics.name');
    expect(sink.filter('step.skip')[0].reason).toBe('no value for basics.name');
  });
});

describe('telemetry sinks', () => {
  it('streams events to JSON Lines and to a store', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cv-telemetry-'));
    const file = join(dir, 'run.jsonl');
    const store = createMemoryStore();
    const memory = createMemorySink();
    const run = createTelemetryRun({
      platform: 'linkedin',
      sink: combineSinks(memory, createJsonlSink(file), createStoreSink(store)),
      now: tick(),
      artifactDir: dir,
    });
    await run.start();
    await run.snapshot(
      'intro',
      '<section data-qa="intro"><h1>Anna</h1></section>'
    );
    await run.finish();

    const lines = (await readFile(file, 'utf8')).trim().split('\n');
    expect(lines.length).toBe(memory.events.length);
    expect(JSON.parse(lines[0]).type).toBe('run.start');

    const links = await store.query();
    expect(links.length).toBe(memory.events.length);
    expect(links[0].tokens[0]).toBe('cv-telemetry');

    const artifacts = await readdir(join(dir, run.runId));
    expect(artifacts).toContain('intro.html');
  });

  it('survives a sink that throws', async () => {
    const memory = createMemorySink();
    const broken = {
      kind: 'broken',
      async write() {
        throw new Error('disk full');
      },
    };
    const run = createTelemetryRun({
      platform: 'superjob',
      sink: combineSinks(broken, memory),
      now: tick(),
    });
    await run.start();
    expect(memory.events.length).toBe(1);
  });
});
