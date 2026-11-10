import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formUploadEnvironment } from './helpers/forms-upload-fixture.mjs';
import {
  resumePdf,
  resumeUploadField,
  MAX_RESUME_BYTES,
} from '../src/forms/resume-upload.js';
import { loadResumePdf } from '../src/cli/forms-resume-file.js';
import { syntheticResumePdf } from '../../experiments/issue-56/forms-resume-fixture.mjs';
import { createFormsCommands } from '../src/cli/forms-commands.js';
import { startServer } from '../src/server/index.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
} from '../src/transport/lino.js';
import { isReadRequest } from '../src/web/request-policy.js';

test(
  'PDF attachment is explicit, verified and consumed; cached recovery never uploads again',
  { timeout: 5000 },
  async () => {
    const env = await formUploadEnvironment();
    try {
      const plan = await env.plan();
      assert(plan.fields[0].answer.uploadSupported);
      assert.equal(env.writes, 0);
      const result = await env.attach(plan);
      assert.equal(result.state, 'attached');
      assert.equal(result.file.sha256, resumePdf(env.file).metadata.sha256);
      assert.equal(result.report.fields[0].upload.files[0].name, env.file.name);
      assert.equal(env.writes, 1);
      assert.deepEqual((await env.attach(plan)).file, result.file);
      assert.equal(env.writes, 1);
      await assert.rejects(
        env.attach(plan, { file: { ...env.file, name: 'other.pdf' } }),
        { code: 'form-upload-conflict' }
      );
      await assert.rejects(
        env.reader.applyReview({
          id: plan.reviewPlan.sessionId,
          planId: plan.reviewPlan.id,
          fields: [env.field.id],
        }),
        { code: 'form-plan-expired' }
      );
      assert.equal(env.disposed, 1);
    } finally {
      await env.reader.stop();
    }
  }
);

test(
  'existing files require separate replacement permission before any upload',
  { timeout: 5000 },
  async () => {
    const env = await formUploadEnvironment();
    try {
      env.field.upload.files = [
        {
          name: 'owner.pdf',
          type: 'application/pdf',
          size: 50,
          lastModified: 1,
        },
      ];
      const plan = await env.plan();
      await assert.rejects(env.attach(plan), { code: 'form-existing-value' });
      assert.equal(env.writes, 0);
      assert.equal(
        (await env.attach(plan, { replaceExisting: true })).state,
        'attached'
      );
      assert.equal(env.writes, 1);
    } finally {
      await env.reader.stop();
    }
  }
);

test(
  'changed/replaced fields refuse before issue and lost or inconsistent upload readback stays uncertain',
  { timeout: 5000 },
  async () => {
    for (const outcome of ['edit', 'replace', 'lost', 'hash', 'other-field']) {
      const env = await formUploadEnvironment();
      try {
        const plan = await env.plan();
        if (outcome === 'edit') {
          env.field.upload.files.push({
            name: 'owner.pdf',
            size: 1,
            type: 'application/pdf',
            lastModified: 1,
          });
        }
        if (outcome === 'replace') {
          env.hooks.check = () => {
            throw Object.assign(new Error('Changed'), { code: 'form-changed' });
          };
        }
        if (outcome === 'lost') {
          env.hooks.write = () => {
            throw new Error('Lost acknowledgement');
          };
        }
        if (outcome === 'hash') {
          env.hooks.read = () => ({
            ...resumePdf(env.file).metadata,
            sha256: 'mismatch',
          });
        }
        if (outcome === 'other-field') {
          env.hooks.read = () => {
            env.report.title = 'Changed page';
            return resumePdf(env.file).metadata;
          };
        }
        const result = await env.attach(plan);
        const issued = !['edit', 'replace'].includes(outcome);
        assert.equal(result.state, issued ? 'uncertain' : 'refused', outcome);
        assert.equal(env.writes, issued ? 1 : 0);
        assert.equal((await env.attach(plan)).state, result.state);
        assert.equal(env.writes, issued ? 1 : 0);
      } finally {
        await env.reader.stop();
      }
    }
  }
);

test(
  'only known single PDF résumé fields advertise attachment and file input is bounded',
  { timeout: 5000 },
  async () => {
    const env = await formUploadEnvironment();
    try {
      assert(resumeUploadField(env.field));
      for (const label of ['CV', 'Резюме PDF', '简历', 'जीवनवृत्त']) {
        assert(resumeUploadField({ ...env.field, label }));
      }
      for (const mutation of [
        { disabled: true },
        { readOnly: true },
        { multiple: true },
        { tag: 'button' },
        { label: 'Portrait' },
        { type: 'password' },
        { upload: { ...env.field.upload, directory: true } },
        { upload: { ...env.field.upload, accept: 'image/*' } },
      ]) {
        assert.equal(resumeUploadField({ ...env.field, ...mutation }), false);
      }
      for (const file of [
        { ...env.file, name: '../resume.pdf' },
        { ...env.file, name: 'resume.txt' },
        { ...env.file, data: `${env.file.data}!` },
        { ...env.file, data: Buffer.from('not a PDF').toString('base64') },
        {
          ...env.file,
          data: 'A'.repeat(Math.ceil(MAX_RESUME_BYTES / 3) * 4 + 4),
        },
      ]) {
        assert.throws(() => resumePdf(file), { code: 'form-upload-file' });
      }
      const plan = await env.plan();
      await assert.rejects(
        env.attach(plan, { file: { name: 'bad.pdf', data: 'bad' } }),
        { code: 'form-upload-file' }
      );
      assert.equal(env.writes, 0);
      assert.equal((await env.attach(plan)).state, 'attached');
    } finally {
      await env.reader.stop();
    }
  }
);

test(
  'text/binary Lino attachments require trusted explicit mutation and keep PDF bytes out of receipts',
  { timeout: 10000 },
  async () => {
    for (const media of [LINO_TEXT, LINO_BINARY]) {
      const env = await formUploadEnvironment();
      await env.reader.stop();
      const server = await startServer({
        ...env.options,
        port: 0,
        localUi: false,
        enableSync: false,
        enableHandlers: false,
        telegramAccount: false,
        automations: { scheduler: false },
        forms: env.options,
        log: null,
      });
      const base = `http://127.0.0.1:${server.port}`;
      const post = async (action, body, headers = {}) =>
        readWireResponse(
          await fetch(`${base}/api/forms/sessions/${action}`, {
            method: 'POST',
            headers: { 'content-type': media, accept: media, ...headers },
            body: encodeWire(body, media),
          })
        );
      try {
        const opened = await post('open', { url: env.report.url });
        const plan = await post('plan', { id: opened.session.id });
        const body = {
          id: opened.session.id,
          planId: plan.reviewPlan.id,
          fieldId: env.field.id,
          file: env.file,
        };
        assert.equal(
          (await post('attach', body, { origin: 'https://untrusted.example' }))
            .code,
          'forbidden'
        );
        assert.equal(env.writes, 0);
        const result = await post('attach', body);
        assert.equal(result.state, 'attached');
        assert(!JSON.stringify(result).includes(env.file.data));
        assert.equal((await post('attach', body)).state, 'attached');
        assert.equal(env.writes, 1);
        assert.equal(
          isReadRequest(`${base}/api/forms/sessions/attach`, 'POST'),
          false
        );
      } finally {
        await server.close();
      }
    }
  }
);

test(
  'CLI reads a bounded chosen PDF and attaches only on its explicit command',
  { timeout: 5000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'forms-resume-'));
    const env = await formUploadEnvironment();
    await env.reader.stop();
    try {
      const path = join(directory, 'synthetic-resume.pdf');
      await writeFile(path, syntheticResumePdf());
      assert.deepEqual(await loadResumePdf(path), env.file);
      await assert.rejects(loadResumePdf(directory), /regular PDF/);
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
      assert.equal(
        await commands['forms-review'](
          { url: env.report.url, 'resume-pdf': path },
          (line) => output.push(JSON.parse(line))
        ),
        0
      );
      assert.equal(
        output.find((item) => item.mode === 'upload-result').state,
        'attached'
      );
      assert.equal(env.writes, 1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
);

test(
  'shutdown retains an issued upload until its operation settles',
  { timeout: 5000 },
  async () => {
    const env = await formUploadEnvironment();
    let release;
    let started;
    const issued = new Promise((resolve) => {
      started = resolve;
    });
    env.hooks.write = () => {
      started();
      return new Promise((resolve) => {
        release = resolve;
      });
    };
    const plan = await env.plan();
    const result = env.attach(plan).catch((error) => error);
    await issued;
    let stopped = false;
    const stopping = env.reader.stop().then(() => {
      stopped = true;
    });
    await new Promise((resolve) => globalThis.setTimeout(resolve, 10));
    assert.equal(stopped, false);
    release();
    await stopping;
    assert.equal((await result).code, 'form-session-closed');
    assert.equal(env.writes, 1);
    assert.equal(env.disposed, 1);
  }
);
