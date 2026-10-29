import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  extractReleaseNotes,
  limitReleaseNotes,
} from '../scripts/github-release-content.mjs';

test('release headings use exact versions and retain all subsection content', () => {
  const changelog =
    '# Changes\r\n## 1.2.30\r\nwrong\r\n## 1.2.3\r\n### Major Changes\r\nfirst\r\n\r\n### Patch Changes\r\nsecond\r\n## 1.2.2\r\nold';
  assert.equal(
    extractReleaseNotes(changelog, '1.2.3'),
    '### Major Changes\nfirst\n\n### Patch Changes\nsecond'
  );
  assert.throws(() => extractReleaseNotes(changelog, '1x2x3'), /no entry/);
  assert.throws(() => extractReleaseNotes(changelog, '9.9.9'), /no entry/);
  assert.equal(extractReleaseNotes('## 1.2.3\n', '1.2.3'), 'Release 1.2.3');
});

test('release body limits preserve UTF-8 and point at the complete tagged notes', () => {
  const original = '🙂'.repeat(200);
  assert.equal(
    limitReleaseNotes(original, 'fixture/repo', 'v1.2.3', 800),
    original
  );
  const shortened = limitReleaseNotes(original, 'fixture/repo', 'v1.2.3', 300);
  assert.ok(Buffer.byteLength(shortened) <= 300);
  assert.ok(shortened.includes('/blob/v1.2.3/CHANGELOG.md'));
  assert.ok(!shortened.includes('\ufffd'));
  assert.throws(
    () => limitReleaseNotes(original, 'fixture/repo', 'v1.2.3', 5),
    /budget/
  );
});

const fixture = fileURLToPath(
  new URL(
    '../../experiments/issue-54/rehearse-github-release.mjs',
    import.meta.url
  )
);
function rehearse(scenario, status) {
  const result = spawnSync(
    process.execPath,
    [
      ...(globalThis.Deno ? ['run', '-A'] : []),
      fixture,
      scenario,
      String(status),
    ],
    { encoding: 'utf8', timeout: 10000 }
  );
  assert.ifError(result.error);
  return { ...result, output: result.stdout + result.stderr };
}

test(
  'release enrichment retains every related PR and refuses unknown lookup state',
  { timeout: 30000 },
  () => {
    const multiple = rehearse('notes-multi', 200);
    assert.equal(multiple.status, 0, multiple.output);
    const payload = JSON.parse(multiple.stdout.match(/^PATCH (.+)$/m)[1]);
    assert.ok(payload.body.includes('#10'), multiple.output);
    assert.ok(payload.body.includes('#20'), multiple.output);
    assert.ok(!payload.body.includes('#99'), multiple.output);
    const refused = rehearse('notes-refused', 200);
    assert.equal(refused.status, 1, refused.output);
    assert.ok(!refused.stdout.includes('PATCH '), refused.output);
  }
);

test(
  'large formatted notes remain bounded, linked and idempotent',
  { timeout: 15000 },
  () => {
    const result = rehearse('notes-large', 200);
    assert.equal(result.status, 0, result.output);
    const payload = JSON.parse(result.stdout.match(/^PATCH (.+)$/m)[1]);
    assert.ok(Buffer.byteLength(payload.body) <= 60000);
    assert.ok(!payload.body.includes('\ufffd'));
    assert.ok(payload.body.includes('/blob/v1.2.3/CHANGELOG.md'));
    assert.ok(payload.body.includes('img.shields.io/badge/npm-1.2.3-blue.svg'));
  }
);

test(
  'release CLI resolves HEAD to the checked-out version commit before POST',
  { timeout: 15000 },
  () => {
    const result = rehearse('create', 404);
    assert.equal(result.status, 0, result.output);
    const payload = JSON.parse(result.stdout.match(/^PAYLOAD (.+)$/m)[1]);
    assert.equal(
      payload.target_commitish,
      result.stdout.match(/^EXPECTED_SHA (.+)$/m)[1]
    );
    assert.equal(payload.tag_name, 'v1.2.3');
    assert.ok(!payload.body.includes('WRONG VERSION'), result.output);
    assert.ok(!payload.body.includes('OLD VERSION'), result.output);
    assert.ok(payload.body.includes('More detail.'), result.output);
  }
);

test(
  'release CLI is idempotent and never writes on unknown lookup state',
  { timeout: 45000 },
  () => {
    for (const status of [200, 401, 403, 429, 500]) {
      const result = rehearse('create', status);
      assert.equal(result.status, status === 200 ? 0 : 1, result.output);
      assert.ok(!result.stdout.includes('PAYLOAD'), result.output);
    }
  }
);

test(
  'formatter fails on absent, refused or unknown release evidence',
  { timeout: 45000 },
  () => {
    for (const status of [404, 401, 403, 429, 500]) {
      const result = rehearse('format', status);
      assert.equal(result.status, 1, result.output);
      assert.ok(!result.stdout.includes('FORMAT '), result.output);
    }
  }
);

test(
  'formatter resolves the version commit before passing it to PR lookup',
  { timeout: 15000 },
  () => {
    const result = rehearse('format', 200);
    assert.equal(result.status, 0, result.output);
    assert.ok(result.stdout.includes('FORMAT '), result.output);
  }
);

test(
  'release note formatting retains all original Markdown and literal escapes',
  { timeout: 15000 },
  () => {
    const result = rehearse('notes', 200);
    assert.equal(result.status, 0, result.output);
    const payload = JSON.parse(result.stdout.match(/^PATCH (.+)$/m)[1]);
    assert.ok(
      payload.body.startsWith(
        '### Patch Changes\n\n- Keep `C:\\new` and quotes: "done"\n\n---\n\nMore detail.'
      ),
      result.output
    );
    assert.ok(payload.body.includes('img.shields.io/badge/npm-1.2.3-blue.svg'));
  }
);
