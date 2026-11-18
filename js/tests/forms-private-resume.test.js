import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  truncate,
  symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { formUploadEnvironment } from './helpers/forms-upload-fixture.mjs';
import {
  availableReviewResume,
  withReviewResume,
} from '../src/forms/private-resume.js';
import { saveConfiguredResume } from '../src/forms/configured-resume.js';
import { MAX_RESUME_BYTES } from '../src/forms/resume-data.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { createFormsCommands } from '../src/cli/forms-commands.js';
import { automaticFormEnvironment } from './helpers/forms-auto-prefill-fixture.mjs';
import { formReviewHttp } from './helpers/forms-review-http.mjs';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';

const limits = { timeout: 5000 };
const environment = async (run) => {
  const env = await formUploadEnvironment();
  const directory = await mkdtemp(path.join(tmpdir(), 'forms-private-pdf-'));
  const file = path.join(directory, 'resume/resume.pdf');
  env.options.store.logFile = path.join(directory, 'data.lino');
  try {
    await mkdir(path.dirname(file));
    await writeFile(file, Buffer.from(env.file.data, 'base64'));
    await run(
      Object.assign(env, { directory, pdfPath: file, store: env.options.store })
    );
  } finally {
    await env.reader.stop();
    await rm(directory, { recursive: true, force: true });
  }
};

test(
  'CLI plans and attaches the conventional PDF without a resume argument',
  limits,
  () =>
    environment(async (env) => {
      await env.reader.stop();
      const output = [];
      const commands = createFormsCommands({
        ...env.options,
        openStore: async () => env.store,
        async *reviewInput() {
          yield 'plan form-1';
          const plan = output.find((item) => item.mode === 'answer-plan');
          yield `attach form-1 ${plan.reviewPlan.id} ${env.field.id}`;
          yield 'quit';
        },
      });
      await commands['forms-review']({ url: env.report.url }, (line) =>
        output.push(JSON.parse(line))
      );
      assert.equal(
        output.find((item) => item.mode === 'upload-result')?.state,
        'attached'
      );
      assert.equal(env.writes, 1);
    })
);

test(
  'automatic prefilling discovers the conventional PDF and retains owner submission review',
  limits,
  () =>
    environment(async (env) => {
      const automatic = await automaticFormEnvironment(1, { store: env.store });
      try {
        const result = await automatic.prefill();
        assert.equal(result.uploads[0]?.state, 'attached');
        assert.equal(result.uploads[0].file.name, 'resume.pdf');
        assert.equal(result.requiresReview, true);
        assert.equal(result.submissionAttempted, false);
      } finally {
        await automatic.reader.stop();
      }
    })
);

for (const media of [LINO_TEXT, LINO_BINARY]) {
  test(
    `conventional PDF discovery and attachment share trusted ${media} transport`,
    limits,
    () =>
      environment(async (env) => {
        await env.reader.stop();
        const http = await formReviewHttp(env.options, media);
        try {
          const opened = await http.post('open', { url: env.report.url });
          const id = opened.session.id;
          const plan = await http.post('plan', {
            id,
            directory: 'ignored',
            resumeFile: 'ignored',
          });
          assert.equal(plan.reviewPlan.resume?.source, 'resume/resume.pdf');
          assert(!JSON.stringify(plan).includes(env.directory));
          const attached = await http.post('attach', {
            id,
            planId: plan.reviewPlan.id,
            fieldId: env.field.id,
            resumeRevision: plan.reviewPlan.resume.revision,
          });
          assert.equal(attached.state, 'attached');
          assert.equal(env.writes, 1);
        } finally {
          await http.server.close();
        }
      })
  );
}

test(
  'private conventional PDF is planned without saving a selection and reaches the native upload',
  limits,
  () =>
    environment(async (env) => {
      const plan = await env.plan();
      const metadata = plan.reviewPlan.resume;
      assert.equal(metadata?.name, 'resume.pdf');
      assert.equal(metadata.source, 'resume/resume.pdf');
      assert.match(metadata.revision, /^private:[a-f0-9]{64}$/u);
      assert(!JSON.stringify(plan).includes(env.directory));
      assert(!JSON.stringify(plan).includes(env.file.data));
      assert.equal(await env.store.get('form-resume:default'), null);
      const result = await env.attach(plan, {
        file: undefined,
        resumeRevision: metadata.revision,
      });
      assert.equal(result.state, 'attached');
      assert.equal(result.file.sha256, metadata.sha256);
      assert.equal(env.writes, 1);
      await rm(env.pdfPath);
      assert.equal(
        (
          await env.attach(plan, {
            file: undefined,
            resumeRevision: metadata.revision,
          })
        ).state,
        'attached'
      );
      assert.equal(env.writes, 1, 'cached acknowledgement never uploads again');
    })
);

test(
  'private PDF edits and deletion refuse an old plan before upload',
  limits,
  () =>
    environment(async (env) => {
      for (const mode of ['changed', 'deleted']) {
        await writeFile(env.pdfPath, Buffer.from(env.file.data, 'base64'));
        const plan = await env.plan();
        const revision = plan.reviewPlan.resume?.revision;
        if (mode === 'changed') {
          await writeFile(
            env.pdfPath,
            Buffer.concat([
              Buffer.from(env.file.data, 'base64'),
              Buffer.from('\n%owner revision'),
            ])
          );
        } else {
          await rm(env.pdfPath);
        }
        await assert.rejects(
          env.attach(plan, { file: undefined, resumeRevision: revision }),
          { code: 'form-resume-changed' }
        );
        assert.equal(env.writes, 0);
      }
    })
);

test(
  'saved and explicitly selected PDFs take precedence over the conventional private PDF',
  limits,
  () =>
    environment(async (env) => {
      const saved = (
        await saveConfiguredResume(env.store, {
          file: { ...env.file, name: 'chosen.pdf' },
        })
      ).resume;
      await writeFile(env.pdfPath, 'invalid private PDF');
      const plan = await env.plan();
      assert.deepEqual(plan.reviewPlan.resume, saved);
      const result = await env.attach(plan, {
        file: undefined,
        resumeRevision: saved.revision,
      });
      assert.equal(result.file.name, 'chosen.pdf');
      env.field.upload.files = [];
      await env.store.delete('form-resume:default');
      await writeFile(env.pdfPath, Buffer.from(env.file.data, 'base64'));
      const fresh = await env.plan();
      const explicit = await env.attach(fresh, {
        file: { ...env.file, name: 'explicit.pdf' },
      });
      assert.equal(explicit.file.name, 'explicit.pdf');
    })
);

test(
  'a newly saved selection invalidates a reviewed private PDF and owner files require replacement consent',
  limits,
  () =>
    environment(async (env) => {
      let plan = await env.plan();
      await saveConfiguredResume(env.store, { file: env.file });
      await assert.rejects(
        env.attach(plan, {
          file: undefined,
          resumeRevision: plan.reviewPlan.resume?.revision,
        }),
        { code: 'form-resume-changed' }
      );
      await env.store.delete('form-resume:default');
      env.field.upload.files = [
        {
          name: 'owner.pdf',
          size: 1,
          type: 'application/pdf',
          lastModified: 0,
        },
      ];
      plan = await env.plan();
      await assert.rejects(
        env.attach(plan, {
          file: undefined,
          resumeRevision: plan.reviewPlan.resume?.revision,
        }),
        { code: 'form-existing-value' }
      );
      assert.equal(env.writes, 0);
      assert.equal(env.field.upload.files[0].name, 'owner.pdf');
    })
);

test(
  'optional private PDF discovery never reads files for memory or missing stores',
  limits,
  () =>
    environment(async (env) => {
      await rm(env.pdfPath);
      assert.equal(await availableReviewResume(env.store), null);
      assert.equal(await availableReviewResume(createMemoryStore()), null);
      env.store.logFile = path.join(env.directory, 'missing/data.lino');
      assert.equal(await availableReviewResume(env.store), null);
    })
);

test(
  'private PDFs reject malformed, oversized, directory and unsafe linked sources with private diagnostics',
  limits,
  () =>
    environment(async (env) => {
      const refused = async () =>
        assert.rejects(
          availableReviewResume(env.store),
          (error) =>
            error.code === 'form-resume-source' &&
            !error.message.includes(env.directory)
        );
      await writeFile(env.pdfPath, 'not a PDF');
      await refused();
      await truncate(env.pdfPath, MAX_RESUME_BYTES + 1);
      await refused();
      await rm(env.pdfPath);
      await mkdir(env.pdfPath);
      await refused();
      await rm(env.pdfPath, { recursive: true });
      if (process.platform !== 'win32') {
        const other = path.join(env.directory, 'elsewhere.pdf');
        await writeFile(other, Buffer.from(env.file.data, 'base64'));
        await symlink(other, env.pdfPath);
        await refused();
        await rm(env.pdfPath);
        await rm(path.dirname(env.pdfPath), { recursive: true });
        const outside = await mkdtemp(
          path.join(tmpdir(), 'forms-pdf-outside-')
        );
        try {
          await writeFile(
            path.join(outside, 'resume.pdf'),
            Buffer.from(env.file.data, 'base64')
          );
          await symlink(outside, path.dirname(env.pdfPath));
          await refused();
        } finally {
          await rm(outside, { recursive: true, force: true });
        }
      }
    })
);

test(
  'selected private PDF writer ownership keeps concurrent saved selection changes ordered',
  limits,
  () =>
    environment(async (env) => {
      const metadata = await availableReviewResume(env.store);
      let release;
      const held = new Promise((resolve) => {
        release = resolve;
      });
      let started;
      const issued = new Promise((resolve) => {
        started = resolve;
      });
      const attaching = withReviewResume(
        env.store,
        metadata.revision,
        async () => {
          started();
          await held;
          return 'attached';
        }
      );
      await issued;
      let saved = false;
      const saving = saveConfiguredResume(env.store, { file: env.file }).then(
        () => {
          saved = true;
        }
      );
      try {
        await nextTurn();
        assert.equal(saved, false);
      } finally {
        release();
        await saving;
      }
      assert.equal(await attaching, 'attached');
      assert.equal(saved, true);
    })
);

test(
  'unrelated forms do not inspect a private PDF and explicit automatic files bypass a malformed default',
  limits,
  () =>
    environment(async (env) => {
      await writeFile(env.pdfPath, 'malformed private PDF');
      const automatic = await automaticFormEnvironment(1, { store: env.store });
      try {
        const result = await automatic.prefill({ file: env.file });
        assert.equal(result.uploads[0]?.state, 'attached');
        assert.equal(result.uploads[0].file.name, env.file.name);
      } finally {
        await automatic.reader.stop();
      }
      Object.assign(env.field, {
        type: 'text',
        label: 'Email',
        value: '',
        valueOmitted: null,
      });
      delete env.field.upload;
      const plan = await env.plan();
      assert.equal(plan.reviewPlan.resume, null);
    })
);
