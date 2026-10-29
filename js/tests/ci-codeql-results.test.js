import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkCodeQLResults } from '../scripts/check-codeql-results.mjs';

const cleanRun = () => ({ tool: { driver: { name: 'CodeQL' } }, results: [] });
const report = (...runs) => ({ version: '2.1.0', runs });
const fixture = (fn) => {
  const root = mkdtempSync(join(tmpdir(), 'codeql-results-'));
  try {
    fn(root, (name, data) =>
      writeFileSync(join(root, name), JSON.stringify(data))
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

test('CodeQL gate fails closed on absent, malformed and incomplete evidence', () =>
  fixture((root, save) => {
    assert.throws(() => checkCodeQLResults(), /Missing/);
    assert.throws(() => checkCodeQLResults(root), /No CodeQL/);
    for (const invalid of [
      {},
      report(),
      report({}),
      report({ ...cleanRun(), results: undefined }),
    ]) {
      save('scan.sarif', invalid);
      assert.throws(() => checkCodeQLResults(root));
    }
    writeFileSync(join(root, 'scan.sarif'), '{');
    assert.throws(() => checkCodeQLResults(root), SyntaxError);
  }));

test('CodeQL gate checks every file, run and severity, including failed tool invocations', () =>
  fixture((root, save) => {
    save('clean.sarif', report(cleanRun()));
    assert.equal(checkCodeQLResults(root).reports, 1);
    mkdirSync(join(root, 'nested'));
    for (const level of ['error', 'warning', 'note', 'none', undefined]) {
      save(
        'nested/scan.sarif',
        report(cleanRun(), {
          ...cleanRun(),
          results: [{ ruleId: 'test/finding', level }],
        })
      );
      assert.throws(() => checkCodeQLResults(root), /test\/finding/);
    }
    save(
      'nested/scan.sarif',
      report({ ...cleanRun(), invocations: [{ executionSuccessful: false }] })
    );
    assert.throws(() => checkCodeQLResults(root), /execution failed/);
  }));

test('audited false positives require an exact rule, path, source line and whole-file digest', () =>
  fixture((root, save) => {
    const source = 'new RegExp(userPattern);\n';
    writeFileSync(join(root, 'source.js'), source);
    const finding = {
      ruleId: 'js/regex-injection',
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: 'source.js' },
            region: { startLine: 1 },
          },
        },
      ],
    };
    save('scan.sarif', report({ ...cleanRun(), results: [finding] }));
    const entry = {
      rule: finding.ruleId,
      path: 'source.js',
      line: source.trim(),
      sha256: createHash('sha256').update(source).digest('hex'),
      reason: 'Deliberate bounded regex API',
      test: 'security-findings.test.js',
    };
    assert.equal(
      checkCodeQLResults(root, { root, exceptions: [entry] })
        .auditedFalsePositives,
      1
    );
    for (const key of ['rule', 'path', 'line', 'sha256', 'reason', 'test']) {
      assert.throws(() =>
        checkCodeQLResults(root, {
          root,
          exceptions: [{ ...entry, [key]: '' }],
        })
      );
    }
    writeFileSync(join(root, 'source.js'), `${source}changed();\n`);
    assert.throws(
      () => checkCodeQLResults(root, { root, exceptions: [entry] }),
      /unresolved/
    );
  }));
