import test from 'node:test';
import assert from 'node:assert/strict';
import { formUploadEnvironment } from './helpers/forms-upload-fixture.mjs';
import { createFormsCommands } from '../src/cli/forms-commands.js';
import { resumePdf } from '../src/forms/resume-upload.js';

test(
  'configured PDF can be reviewed and attached without choosing its path again',
  { timeout: 5000 },
  async () => {
    const env = await formUploadEnvironment();
    await env.reader.stop();
    await env.options.store.put({
      id: 'form-resume:default',
      tokens: ['form-resume'],
      file: env.file,
      metadata: resumePdf(env.file).metadata,
      revision: globalThis.crypto.randomUUID(),
      updatedAt: new Date().toISOString(),
    });
    const output = [];
    const commands = createFormsCommands({
      ...env.options,
      openStore: async () => env.options.store,
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
      env.writes,
      1,
      JSON.stringify(output.filter((entry) => entry.ok === false))
    );
    assert.equal(
      output.find((entry) => entry.mode === 'upload-result')?.state,
      'attached'
    );
  }
);

test(
  'saved PDF selection is frozen in the plan; stale revisions and unreviewed replacements never upload',
  { timeout: 5000 },
  async () => {
    const { saveConfiguredResume } =
      await import('../src/forms/configured-resume.js');
    const env = await formUploadEnvironment();
    try {
      const first = (
        await saveConfiguredResume(env.options.store, { file: env.file })
      ).resume;
      const plan = await env.plan();
      assert.deepEqual(plan.reviewPlan.resume, first);
      assert(!JSON.stringify(plan).includes(env.file.data));
      const second = (
        await saveConfiguredResume(env.options.store, {
          file: { ...env.file, name: 'updated.pdf' },
          revision: first.revision,
        })
      ).resume;
      for (const revision of [first.revision, second.revision]) {
        await assert.rejects(
          env.attach(plan, { file: undefined, resumeRevision: revision }),
          { code: 'form-resume-changed' }
        );
      }
      assert.equal(env.writes, 0);
      const fresh = await env.plan();
      await assert.rejects(
        env.attach(fresh, { resumeRevision: second.revision }),
        { code: 'form-upload-file' }
      );
      const result = await env.attach(fresh, {
        file: undefined,
        resumeRevision: second.revision,
      });
      assert.equal(result.state, 'attached');
      assert.equal(result.file.name, 'updated.pdf');
      assert.equal(result.resumeRevision, second.revision);
      await env.options.store.delete('form-resume:default');
      const { reviewSession: _firstSession, ...receipt } = result;
      const { reviewSession: _recoveredSession, ...recovered } =
        await env.attach(fresh, {
          file: undefined,
          resumeRevision: second.revision,
        });
      assert.deepEqual(recovered, receipt);
      assert.equal(
        env.writes,
        1,
        'recovery returns the actual receipt after saved PDF deletion'
      );
    } finally {
      await env.reader.stop();
    }
  }
);

test(
  'saved PDF attachment retains separate replacement consent and verifies stored bytes',
  { timeout: 5000 },
  async () => {
    const { saveConfiguredResume, FORM_RESUME_ID } =
      await import('../src/forms/configured-resume.js');
    const env = await formUploadEnvironment();
    try {
      const saved = (
        await saveConfiguredResume(env.options.store, { file: env.file })
      ).resume;
      env.field.upload.files = [
        {
          name: 'owner.pdf',
          size: 1,
          type: 'application/pdf',
          lastModified: 1,
        },
      ];
      const plan = await env.plan();
      const input = { file: undefined, resumeRevision: saved.revision };
      await assert.rejects(env.attach(plan, input), {
        code: 'form-existing-value',
      });
      const record = await env.options.store.get(FORM_RESUME_ID);
      await env.options.store.put({
        ...record,
        file: { ...record.file, name: 'tampered.pdf' },
      });
      await assert.rejects(
        env.attach(plan, { ...input, replaceExisting: true }),
        { code: 'form-resume-invalid' }
      );
      assert.equal(env.writes, 0);
      await env.options.store.put(record);
      assert.equal(
        (await env.attach(plan, { ...input, replaceExisting: true })).state,
        'attached'
      );
      assert.equal(env.writes, 1);
    } finally {
      await env.reader.stop();
    }
  }
);
