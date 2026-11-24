import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { extractAnswerProfile } from '../src/automation/question-profile-source.js';
import { Link } from 'links-notation';
import { profileCv } from '../../experiments/issue-56/question-profile-fixture.mjs';

test('legacy contacts preserve named lists and produce review-only field drafts', async () => {
  const store = createMemoryStore();
  const result = await extractAnswerProfile(store, {
    format: 'contacts-lino',
    text: 'telegram\n  "@example_owner"\ngithub\n  github.com/example\n  "github.com/example-org"\n',
  });
  assert.deepEqual(result.profile, {
    telegram: '@example_owner',
    github: 'github.com/example\ngithub.com/example-org',
  });
  assert.equal(result.readOnly, true);
  assert.equal(result.requiresReview, true);
  assert.deepEqual(await store.query(() => true), []);
});

test('upstream literal quoting preserves spaces, both quotes and real multiline text', async () => {
  const value = '  Owner "alias" and apostrophe\'s name\nnext line  ';
  const result = await extractAnswerProfile(createMemoryStore(), {
    format: 'contacts-lino',
    text: `# heading\n// old comment\nsummary\n  ${Link.escapeReference(value)}\nname\n  "林 Example" # comment\n`,
  });
  assert.equal(result.profile.summary, value.trim());
  assert.equal(result.profile.name, '林 Example');
  assert.deepEqual(result.fields[0].candidates[0].evidence, [
    { source: 'contacts.lino', path: 'lines:3-4' },
  ]);
  for (const newline of ['\n', '\r\n', '\r']) {
    const multiline = await extractAnswerProfile(createMemoryStore(), {
      format: 'contacts-lino',
      text: `summary${newline}  "one${newline}second"`,
    });
    assert.equal(multiline.profile.summary, `one${newline}second`);
    assert.equal(
      multiline.fields[0].candidates[0].evidence[0].path,
      'lines:1-3'
    );
  }
});

test('duplicate keys retain alternatives, while existing owner values survive', async () => {
  const profile = { email: 'current@example.test', custom: 'keep' };
  const result = await extractAnswerProfile(createMemoryStore(), {
    format: 'contacts-lino',
    profile,
    text: 'email\n  first@example.test\nemail\n  second@example.test\nemail\n  first@example.test\n',
  });
  assert.deepEqual(result.profile, profile);
  const field = result.fields[0];
  assert.equal(field.conflict, true);
  assert.deepEqual(
    field.candidates.map((c) => c.value),
    ['first@example.test', 'second@example.test']
  );
  assert.equal(field.candidates[0].evidence.length, 2);
});

test('unsafe, cut, nested and empty entries have source-only skip reports', async () => {
  const result = await extractAnswerProfile(createMemoryStore(), {
    format: 'contacts-lino',
    text: 'linkedin\n  https://www.linkedin.com/in/example\nwebsite\n  "https://example.test/private/access"\nname\n    nested\nempty\ninvalid key\n  secret-marker\nphone\n  "{{phone}}"\n',
  });
  assert.deepEqual(result.profile, {});
  assert.equal(result.skipped.length, 6);
  assert.equal(JSON.stringify(result.skipped).includes('secret-marker'), false);
  assert.equal(
    JSON.stringify(result.skipped).includes('/private/access'),
    false
  );
  assert.equal(
    result.skipped[0].reason,
    'unsupported-structure-or-unquoted-colon'
  );
});

test('all list members must be valid and joined lists remain literal values', async () => {
  const result = await extractAnswerProfile(createMemoryStore(), {
    format: 'contacts-lino',
    text: 'email\n  first@example.test\n  second@example.test\ntelegram\n  "@example_owner"\n  "@another_owner"\nwebsite\n  "https://example.test/public"\n  "https://example.test/invite/private"\n',
  });
  assert.equal(result.profile.email, 'first@example.test\nsecond@example.test');
  assert.equal(result.profile.telegram, '@example_owner\n@another_owner');
  assert.equal(result.profile.website, undefined);
  assert.equal(result.skipped.length, 1);
});

test('legacy values and one explicitly selected CV retain their separate evidence', async () => {
  const store = createMemoryStore();
  await store.put(profileCv);
  const result = await extractAnswerProfile(store, {
    cvId: profileCv.id,
    format: 'contacts-lino',
    text: 'email\n  legacy@example.test\n',
  });
  const email = result.fields.find((f) => f.key === 'email');
  assert.equal(email.conflict, true);
  assert.deepEqual(
    email.candidates.map((c) => c.value),
    ['cv-owner@example.test', 'legacy@example.test']
  );
  assert.equal(email.candidates[1].evidence[0].source, 'contacts.lino');
  assert.equal(result.profile.email, undefined);
  assert.deepEqual(await store.get(profileCv.id), profileCv);
});

test('malformed, ambiguous and over-budget input cannot silently become profile values', async () => {
  const run = (text, format = 'contacts-lino') =>
    extractAnswerProfile(createMemoryStore(), { text, format });
  await assert.rejects(
    run('name\n  "secret-marker\n'),
    (error) =>
      !error.message.includes('secret-marker') &&
      /valid bounded/u.test(error.message)
  );
  await assert.rejects(run('  orphan\n'), /field before/u);
  await assert.rejects(run('name\n  value\n', 'unknown'), /format/u);
  await assert.rejects(run('name\n  value\n'.repeat(101)), /100 entries/u);
  await assert.rejects(run('#\n'.repeat(4097)), /4096 lines/u);
  await assert.rejects(run('name\n  (((((deep)))))\n'), /bounded/u);
  await assert.rejects(run('x'.repeat(64001)), /64000/u);
  const oversized = await run(`summary\n  "${'x'.repeat(2001)}"\n`);
  assert.deepEqual(oversized.profile, {});
  assert.equal(oversized.skipped.length, 1);
  const ambiguous = await run('summary\n  "one" "two"\n');
  assert.equal(ambiguous.skipped[0].reason, 'ambiguous-quoted-value');
});
