import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createMemoryStore } from '../src/storage/universal.js';
import { planFormAnswers } from '../src/forms/answer-plan.js';
import { readPrivateFormProfile } from '../src/forms/private-profile.js';
import { createReviewedPrefill } from '../src/forms/review-prefill.js';
import { learnFormAnswerPairs } from '../src/forms/answer-learning.js';
import { saveAnswerProfile } from '../src/automation/question-profiles.js';
import { listAnswerRules } from '../src/automation/question-store.js';
import { createFormsCommands } from '../src/cli/forms-commands.js';
import { startServer } from '../src/server/index.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
} from '../src/transport/lino.js';
import {
  formModelField as field,
  formModelInspection as inspection,
} from './helpers/forms-plan-inspection.mjs';
import { resumeMarkdown } from '../../experiments/issue-56/resume-profile-fixture.mjs';
import { automaticFormEnvironment } from './helpers/forms-auto-prefill-fixture.mjs';

const fixture = async (run) => {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'forms-private-profile-')
  );
  const store = {
    ...createMemoryStore(),
    logFile: path.join(directory, 'data.lino'),
  };
  const write = async (name, text) => {
    await mkdir(path.dirname(path.join(directory, name)), { recursive: true });
    await writeFile(path.join(directory, name), text);
  };
  try {
    await run({ directory, store, write });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};
const plan = (store, fields, input = {}) =>
  planFormAnswers(store, { inspection: inspection(fields), ...input });
const emailField = () => field('Email', { type: 'email' });

test(
  'private resume, canonical contacts and expanded overrides load automatically without saving profiles',
  { timeout: 10000 },
  () =>
    fixture(async ({ store, directory, write }) => {
      await write('resume/resume.md', resumeMarkdown);
      await write(
        'contacts.lino',
        'email\n  canonical@example.test\nfull_name\n  "Canonical Owner"\ncity\n  Hanoi\n'
      );
      await write(
        'profile.lino',
        'city\n  "Da Nang"\ntimezone\n  "UTC+07:00"\nsummary\n  "Contact {{email}} in {{city}}"\n'
      );
      const before = JSON.stringify(await store.query());
      const report = await plan(store, [
        emailField(),
        field('Full name'),
        field('Date of birth', { type: 'date' }),
        field('Location'),
        field('Time zone'),
        field('Phone', { value: 'Owner edit' }),
      ]);
      assert.deepEqual(
        report.fields.slice(0, 5).map((entry) => entry.answer.proposal?.value),
        [
          'canonical@example.test',
          'Canonical Owner',
          '1990-03-02',
          'Da Nang',
          'UTC+07:00',
        ]
      );
      assert.equal(report.fields[5].answer.preserveCurrent, true);
      assert(report.fields.every((entry) => entry.answer.requiresReview));
      const files = report.planning.profileSource.privateFiles;
      assert.deepEqual(
        files.map((entry) => entry.source),
        ['resume/resume.md', 'contacts.lino', 'profile.lino']
      );
      for (const entry of files) {
        assert.equal(
          entry.sha256,
          createHash('sha256')
            .update(await readFile(path.join(directory, entry.source)))
            .digest('hex')
        );
      }
      assert.equal(JSON.stringify(report.planning).includes(directory), false);
      assert.equal(JSON.stringify(await store.query()), before);
      const defaults = await readPrivateFormProfile(store);
      assert.equal(
        defaults.profile.summary,
        'Contact canonical@example.test in Hanoi'
      );
      assert.equal(defaults.profile.full_name, undefined);
      assert.equal(
        await readFile(path.join(directory, 'resume/resume.md'), 'utf8'),
        resumeMarkdown
      );
    })
);

test(
  'named and inline profile choices win over current private defaults, including explicit clearing',
  { timeout: 10000 },
  () =>
    fixture(async ({ store, write }) => {
      await write(
        'contacts.lino',
        'email\n  file@example.test\nphone\n  +15555550123\n'
      );
      const saved = await saveAnswerProfile(store, {
        id: 'owner',
        name: 'Owner',
        values: { email: 'named@example.test' },
      });
      assert.equal(
        (await plan(store, [emailField()], { profileId: saved.id })).fields[0]
          .answer.proposal.value,
        'named@example.test'
      );
      const overridden = await plan(store, [emailField(), field('Phone')], {
        profileId: saved.id,
        profile: { email: 'inline@example.test', phone: '' },
      });
      assert.equal(
        overridden.fields[0].answer.proposal.value,
        'inline@example.test'
      );
      assert.equal(overridden.fields[1].answer.proposal, null);
      assert.equal(overridden.planning.profileSource.revision, saved.revision);
      await write('contacts.lino', 'email\n  updated@example.test\n');
      assert.equal(
        (await plan(store, [emailField()])).fields[0].answer.proposal.value,
        'updated@example.test'
      );
      await rm(path.join(path.dirname(store.logFile), 'contacts.lino'));
      assert.equal(
        (await plan(store, [emailField()])).fields[0].answer.proposal,
        null
      );
    })
);

test(
  'missing private files and stores without a local log never invent a profile',
  { timeout: 10000 },
  () =>
    fixture(async ({ store, write }) => {
      assert.equal(
        (await plan(store, [emailField()])).planning.profileSource,
        null
      );
      await write('contacts.lino', 'email\n  file@example.test\n');
      assert.equal(
        (await plan(createMemoryStore(), [emailField()])).fields[0].answer
          .proposal,
        null
      );
      assert.deepEqual(
        await readPrivateFormProfile({
          logFile: path.join(path.dirname(store.logFile), 'missing/data.lino'),
        }),
        { profile: {}, files: [] }
      );
      await write('profile.lino', '');
      assert.equal(
        (await plan(store, [emailField()])).planning.profileSource.privateFiles
          .length,
        2
      );
    })
);

test(
  'unsafe, malformed and oversized private sources refuse with bounded source-only errors',
  { timeout: 10000 },
  () =>
    fixture(async ({ store, write, directory }) => {
      for (const value of [
        Buffer.from([0xff]),
        'x'.repeat(64001),
        'x'.repeat(256001),
        'email\n  "unfinished',
      ]) {
        await write('contacts.lino', value);
        await assert.rejects(
          plan(store, [emailField()]),
          (error) =>
            error.code === 'form-profile-source' &&
            !error.message.includes(directory) &&
            !error.message.includes('unfinished')
        );
      }
      await rm(path.join(directory, 'contacts.lino'));
      await mkdir(path.join(directory, 'contacts.lino'));
      await assert.rejects(plan(store, [emailField()]), {
        code: 'form-profile-source',
      });
      await rm(path.join(directory, 'contacts.lino'), { recursive: true });
      if (process.platform !== 'win32') {
        await write('outside.txt', 'email\n  hidden@example.test\n');
        await symlink(
          path.join(directory, 'outside.txt'),
          path.join(directory, 'contacts.lino')
        );
        await assert.rejects(plan(store, [emailField()]), {
          code: 'form-profile-source',
        });
        await rm(path.join(directory, 'contacts.lino'));
        const outside = await mkdtemp(path.join(tmpdir(), 'private-outside-'));
        try {
          await writeFile(path.join(outside, 'resume.md'), resumeMarkdown);
          await symlink(outside, path.join(directory, 'resume'));
          await assert.rejects(plan(store, [emailField()]), {
            code: 'form-profile-source',
          });
        } finally {
          await rm(outside, { recursive: true, force: true });
        }
      }
    })
);

test(
  'ambiguous contact alternatives remain unresolved and conflicting legacy aliases refuse',
  { timeout: 10000 },
  () =>
    fixture(async ({ store, write }) => {
      await write('resume/resume.md', resumeMarkdown);
      await write(
        'contacts.lino',
        'email\n  first@example.test\nemail\n  second@example.test\n'
      );
      const report = await plan(store, [emailField()]);
      assert.equal(report.fields[0].answer.proposal, null);
      assert.deepEqual(
        report.planning.profileSource.privateFiles.find(
          (entry) => entry.source === 'contacts.lino'
        ).conflicts,
        ['email']
      );
      await write('contacts.lino', 'email\n  "{{unknown}}"\n');
      const missing = await plan(store, [emailField()]);
      assert.equal(missing.fields[0].answer.proposal, null);
      assert.equal(missing.planning.profileSource.privateFiles[1].skipped, 1);
      await write('contacts.lino', 'city\n  Hanoi\nlocation\n  "Da Nang"\n');
      await assert.rejects(plan(store, [field('Location')]), {
        code: 'form-profile-source',
      });
    })
);

test(
  'changed private source bytes invalidate a reviewed fill before any write',
  { timeout: 10000 },
  () =>
    fixture(async ({ store, write }) => {
      await write('contacts.lino', 'email\n  original@example.test\n');
      const snapshot = inspection([
        field('Email', { type: 'email', tag: 'input', index: 0 }),
      ]);
      let writes = 0;
      let disposed = 0;
      const filling = createReviewedPrefill({
        store,
        inspect: async (_browser, options) => {
          options.onSnapshot?.({});
          return globalThis.structuredClone(snapshot);
        },
        capture: async () => ({
          check: async () => {},
          dispose: async () => {
            disposed++;
          },
          get: () => null,
        }),
        write: async () => {
          writes++;
        },
      });
      const record = { id: 'private-profile-review', browser: {} };
      const proposed = await filling.plan(record, {}, () => {});
      assert.equal(
        proposed.fields[0].answer.proposal.value,
        'original@example.test'
      );
      await write('contacts.lino', 'email\n  changed@example.test\n');
      const result = await filling.apply(
        record,
        { planId: proposed.reviewPlan.id, fields: [snapshot.fields[0].id] },
        () => {}
      );
      assert.equal(result.state, 'refused');
      assert.equal(result.code, 'form-answers-changed');
      assert.equal(writes, 0);
      assert.equal(disposed, 1);
    })
);

test(
  'learning uses the same private contacts for skipping known facts and contracting new answers',
  { timeout: 10000 },
  () =>
    fixture(async ({ store, write }) => {
      await write(
        'contacts.lino',
        'email\n  canonical@example.test\nfull_name\n  "Owner Example"\n'
      );
      const pairs = [
        {
          question: 'Full name',
          text: 'Owner Example',
          field: field('Full name'),
          url: 'https://example.test/form',
          evidence: 'owner-submission',
        },
        {
          question: 'Email',
          text: 'canonical@example.test',
          field: emailField(),
          url: 'https://example.test/form',
          evidence: 'owner-submission',
        },
        {
          question: 'How can we reach you?',
          text: 'Write to canonical@example.test',
          field: field('How can we reach you?'),
          url: 'https://example.test/form',
          evidence: 'owner-submission',
        },
      ];
      const result = await learnFormAnswerPairs(store, pairs);
      assert.equal(result.saved, 1);
      assert.equal(result.skipped, 2);
      const rules = await listAnswerRules(store);
      assert.equal(rules[0].answers[0].text, 'Write to {{email}}');
      assert.equal(rules[0].answers[0].approved, false);
      assert.equal(rules[0].answers[0].count, 1);
    })
);

test(
  'a private contact change during learning refuses before persistence',
  { timeout: 10000 },
  () =>
    fixture(async ({ store, write }) => {
      await write('contacts.lino', 'email\n  original@example.test\n');
      let checks = 0;
      await assert.rejects(
        learnFormAnswerPairs(
          store,
          [
            {
              question: 'Recent experience',
              text: 'Five years',
              field: field('Recent experience'),
              url: 'https://example.test/form',
              evidence: 'owner-submission',
            },
          ],
          {
            check: async () => {
              if (++checks === 2) {
                await write('contacts.lino', 'email\n  changed@example.test\n');
              }
            },
          }
        ),
        { code: 'form-profile-changed' }
      );
      assert.deepEqual(await listAnswerRules(store), []);
    })
);

test(
  'automatic prefilling uses private defaults without a named profile and retains submission review',
  { timeout: 10000 },
  () =>
    fixture(async ({ directory, write }) => {
      await write(
        'contacts.lino',
        'email\n  automatic@example.test\nfull_name\n  "Private Owner"\n'
      );
      const env = await automaticFormEnvironment();
      env.options.store.logFile = path.join(directory, 'data.lino');
      try {
        const result = await env.prefill({ profileId: '' });
        assert.equal(result.state, 'partial');
        assert.equal(result.requiresReview, true);
        assert.equal(result.submissionAttempted, false);
        assert.equal(result.receipts.length, 2);
        assert(
          result.receipts.every((receipt) => receipt.status === 'applied')
        );
        assert.deepEqual(
          env.report.fields.slice(0, 2).map((entry) => entry.value),
          ['Private Owner', 'automatic@example.test']
        );
      } finally {
        await env.reader.stop();
      }
    })
);

test(
  'forms-plan CLI automatically loads selected-store contacts and closes its store',
  { timeout: 10000 },
  () =>
    fixture(async ({ store, write, directory }) => {
      await write('contacts.lino', 'email\n  cli@example.test\n');
      await write(
        'inspection.json',
        JSON.stringify(inspection([emailField()]))
      );
      let closed = 0;
      const commands = createFormsCommands({
        openStore: async () => ({
          ...store,
          close: async () => {
            closed++;
          },
        }),
        reportWriter: null,
      });
      const output = [];
      assert.equal(
        await commands['forms-plan'](
          { file: path.join(directory, 'inspection.json'), store: directory },
          (value) => output.push(JSON.parse(value))
        ),
        0
      );
      assert.equal(
        output[0].fields[0].answer.proposal.value,
        'cli@example.test'
      );
      assert.equal(closed, 1);
    })
);

test(
  'both HTTP encodings use selected-store defaults and ignore request-selected host paths',
  { timeout: 15000 },
  () =>
    fixture(async ({ store, write, directory }) => {
      await write('contacts.lino', 'email\n  api@example.test\n');
      const server = await startServer({
        store,
        port: 0,
        enableSync: false,
        enableHandlers: false,
        telegramAccount: false,
        automations: { scheduler: false },
        forms: { reportWriter: null },
      });
      try {
        for (const type of [LINO_TEXT, LINO_BINARY]) {
          const response = await fetch(
            `http://127.0.0.1:${server.port}/api/forms/plan`,
            {
              method: 'POST',
              headers: { accept: type, 'content-type': type },
              body: encodeWire(
                {
                  inspection: inspection([emailField()]),
                  directory: '/not-an-owner-selected-store',
                  profileFile: '/not-a-source.lino',
                },
                type
              ),
            }
          );
          assert.equal(response.status, 200);
          const report = await readWireResponse(response);
          assert.equal(
            report.fields[0].answer.proposal.value,
            'api@example.test'
          );
          assert.equal(
            JSON.stringify(report.planning).includes(directory),
            false
          );
        }
      } finally {
        await server.close();
      }
    })
);
