import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  extractAnswerProfile,
  listAnswerProfileSources,
} from '../src/automation/question-profile-source.js';
import {
  profileCv,
  profileContacts,
} from '../../experiments/issue-56/question-profile-fixture.mjs';
import { cvToLino } from '../src/cv/model.js';

test(
  'selected CV and contact text retain conflicting facts and exact source evidence',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    await store.put(profileCv);
    const before = globalThis.structuredClone(await store.query(() => true));
    const result = await extractAnswerProfile(store, {
      cvId: 'cv:hh',
      text: profileContacts,
    });
    assert.equal(result.profile.email, undefined);
    const email = result.fields.find((field) => field.key === 'email');
    assert.equal(email.conflict, true);
    assert.deepEqual(
      email.candidates.map((c) => c.value),
      ['cv-owner@example.test', 'contact-owner@example.test']
    );
    assert.deepEqual(email.candidates[0].evidence, [
      {
        source: 'cv:hh',
        path: 'basics.email',
        capturedAt: profileCv.capturedAt,
      },
    ]);
    assert.deepEqual(email.candidates[1].evidence, [
      { source: 'text', path: 'line:1' },
    ]);
    const telegram = result.fields.find((field) => field.key === 'telegram');
    assert.equal(telegram.candidates.length, 1);
    assert.equal(telegram.candidates[0].evidence.length, 2);
    assert.equal(result.profile.skills, 'JavaScript\nRust');
    assert.equal(result.readOnly, true);
    assert.equal(result.requiresReview, true);
    assert.deepEqual(await store.query(() => true), before);
  }
);

test(
  'existing owner values and missing fields survive extraction without implicit overrides',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    const profile = {
      email: 'current@example.test',
      custom: 'keep me',
      phone: '',
    };
    const result = await extractAnswerProfile(store, {
      profile,
      text: 'Email: other@example.test\nPhone: not a phone',
    });
    assert.deepEqual(result.profile, profile);
    assert.equal(result.fields[0].current, profile.email);
    assert.equal(result.fields[0].conflict, true);
    assert.equal(result.skipped[0].key, 'phone');
    assert.equal(result.skipped[0].value, undefined);
  }
);

test(
  'contact labels work in all four UI languages and standalone public contacts remain usable',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    for (const text of [
      'Name: Alex\nEmail: owner@example.test\nPhone: +1 555 555 0123\nCity: Hanoi',
      'Имя: Alex\nПочта: owner@example.test\nТелефон: +1 555 555 0123\nГород: Hanoi',
      'नाम: Alex\nईमेल: owner@example.test\nफ़ोन: +1 555 555 0123\nशहर: Hanoi',
      '姓名：Alex\n邮箱：owner@example.test\n电话：+1 555 555 0123\n城市：Hanoi',
    ]) {
      assert.deepEqual((await extractAnswerProfile(store, { text })).profile, {
        name: 'Alex',
        email: 'owner@example.test',
        phone: '+1 555 555 0123',
        location: 'Hanoi',
      });
    }
    const result = await extractAnswerProfile(store, {
      text: 'Reach me at owner@example.test; https://www.linkedin.com/in/example-owner/ https://t.me/example_owner.',
    });
    assert.equal(result.profile.email, 'owner@example.test');
    assert.equal(
      result.profile.linkedin,
      'https://www.linkedin.com/in/example-owner/'
    );
    assert.equal(result.profile.telegram, 'https://t.me/example_owner');
  }
);

test(
  'private links, executable placeholders and malformed contacts cannot become extracted fields',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    for (const text of [
      'Telegram: https://t.me/+private_example',
      'Telegram: https://t.me/joinchat/example',
      'Website: https://example.test/%70rivate/report',
      'Website: https://example.test/form?code=example',
      'Website: https://example.test/#example',
      'Website: https://user@example.test/portfolio',
      'Website: https://localhost/portfolio',
      'Summary: Join tg://resolve?domain=example',
      'Name: {{email}}',
      'Email: missing-at-sign',
      'Phone: +1 555 555 0123 extension 5',
    ]) {
      const result = await extractAnswerProfile(store, { text });
      assert.deepEqual(result.profile, {}, text);
      assert.equal(result.skipped.length, 1, text);
    }
  }
);

test(
  'canonical Lino CVs import contact facts without guessing salary semantics',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    await store.put({
      id: 'cv:linkedin',
      lino: cvToLino({
        ...profileCv.cv,
        preferences: { salary: '6000', currency: 'USD' },
      }),
    });
    const result = await extractAnswerProfile(store, { cvId: 'cv:linkedin' });
    assert.equal(result.profile.email, 'cv-owner@example.test');
    assert.ok(
      !Object.keys(result.profile).some((key) => key.startsWith('salary'))
    );
  }
);

test(
  'source limits and malformed or missing snapshots fail before any write',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    for (const [input, error] of [
      [{}, /select a CV/u],
      [{ text: 'x'.repeat(64001) }, /64000/u],
      [{ cvId: 'msg:hh:1:1' }, /cv: identifier/u],
      [{ cvId: 'cv:missing' }, /unavailable/u],
      [
        { text: 'Email: owner@example.test', profile: { email: 1 } },
        /profile field/u,
      ],
      [
        {
          text: Array.from(
            { length: 21 },
            (_, i) => `Email: owner${i}@example.test`
          ).join('\n'),
        },
        /20 variants/u,
      ],
    ]) {
      await assert.rejects(extractAnswerProfile(store, input), error);
    }
    await store.put({ id: 'cv:bad', cv: { skills: Array(101).fill('JS') } });
    await assert.rejects(
      extractAnswerProfile(store, { cvId: 'cv:bad' }),
      /100 entries/u
    );
    await store.put({ id: 'cv:empty' });
    await assert.rejects(
      extractAnswerProfile(store, { cvId: 'cv:empty' }),
      /readable/u
    );
    assert.equal((await store.query(() => true)).length, 2);
  }
);

test(
  'source discovery projects metadata only and enforces a finite source catalogue',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    await store.put(profileCv);
    await store.put({ id: 'msg:hh:1:1', body: 'not a profile source' });
    assert.deepEqual(await listAnswerProfileSources(store), {
      sources: [{ id: 'cv:hh', capturedAt: profileCv.capturedAt }],
    });
    delete store.scan;
    assert.equal((await listAnswerProfileSources(store)).sources.length, 1);
    await store.put({ ...profileCv, capturedAt: 'x'.repeat(81) });
    assert.equal(
      (await listAnswerProfileSources(store)).sources[0].capturedAt,
      null
    );
    const extracted = await extractAnswerProfile(store, { cvId: 'cv:hh' });
    assert.equal(
      extracted.fields[0].candidates[0].evidence[0].capturedAt,
      null
    );
    for (let i = 0; i < 50; i++) {
      await store.put({ id: `cv:source${i}` });
    }
    await assert.rejects(listAnswerProfileSources(store), /limit \(50\)/u);
  }
);
