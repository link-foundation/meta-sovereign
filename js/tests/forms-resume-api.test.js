import test from 'node:test';
import assert from 'node:assert/strict';
import { formUploadEnvironment } from './helpers/forms-upload-fixture.mjs';
import { formReviewHttp } from './helpers/forms-review-http.mjs';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
} from '../src/transport/lino.js';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  saveConfiguredResume,
  configuredResume,
} from '../src/forms/configured-resume.js';
import { createFormResumeApi } from '../src/web/form-resume-api.js';
import { syntheticResumePdf } from '../../experiments/issue-56/forms-resume-fixture.mjs';
import { isReadRequest } from '../src/web/request-policy.js';

const file = {
  name: 'synthetic-resume.pdf',
  data: syntheticResumePdf().toString('base64'),
};

test(
  'text/binary Lino configure and attach the saved PDF only through trusted explicit mutations',
  { timeout: 10000 },
  async () => {
    for (const media of [LINO_TEXT, LINO_BINARY]) {
      const env = await formUploadEnvironment();
      await env.reader.stop();
      const { server, base, post } = await formReviewHttp(env.options, media);
      const request = async (action, input, headers = {}) => {
        const response = await fetch(
          `${base}/api/forms/resume${action ? `/${action}` : ''}`,
          {
            method: action ? 'POST' : 'GET',
            headers: { accept: media, 'content-type': media, ...headers },
            ...(action ? { body: encodeWire(input, media) } : {}),
          }
        );
        return readWireResponse(response);
      };
      try {
        assert.equal(
          (
            await request(
              'save',
              { file },
              { origin: 'https://untrusted.example' }
            )
          ).code,
          'forbidden'
        );
        assert.equal((await request('', null)).resume, null);
        const saved = (await request('save', { file })).resume;
        assert.equal(
          (await request('save', { file })).code,
          'form-resume-changed'
        );
        assert.deepEqual((await request('', null)).resume, saved);
        const opened = await post('open', { url: env.report.url });
        const plan = await post('plan', { id: opened.session.id });
        assert.deepEqual(plan.reviewPlan.resume, saved);
        const body = {
          id: opened.session.id,
          planId: plan.reviewPlan.id,
          fieldId: env.field.id,
          resumeRevision: saved.revision,
        };
        const result = await post('attach', body);
        assert.equal(result.state, 'attached');
        assert.equal(result.resumeRevision, saved.revision);
        assert.equal(
          (
            await request('delete', saved, {
              origin: 'https://untrusted.example',
            })
          ).code,
          'forbidden'
        );
        assert.equal((await request('delete', saved)).resume, null);
        assert.equal((await post('attach', body)).state, 'attached');
        assert.equal(env.writes, 1);
        assert(!JSON.stringify({ saved, plan, result }).includes(file.data));
        for (const action of ['save', 'delete']) {
          assert.equal(
            isReadRequest(`${base}/api/forms/resume/${action}`, 'POST'),
            false
          );
        }
      } finally {
        await server.close();
      }
    }
  }
);

test(
  'offline saved-PDF controls persist locally and explicit remote refusals never fall back',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    const local = async () => store;
    const offline = createFormResumeApi({
      get: async () => null,
      report: async () => null,
      local,
    });
    const saved = await offline.saveFormsResume({ file });
    assert.deepEqual(await offline.formsResume(), saved);
    for (const reply of [
      { ok: false, code: 'fixture-refused' },
      {},
      { ok: true },
      { ok: true, resume: null },
      { ok: true, resume: saved.resume },
    ]) {
      const remote = createFormResumeApi({
        get: async () => reply,
        report: async () => reply,
        local,
      });
      await assert.rejects(
        remote.saveFormsResume({ file, revision: saved.resume.revision })
      );
      if (reply.resume !== null) {
        await assert.rejects(remote.deleteFormsResume(saved.resume));
      }
      assert.deepEqual(await configuredResume(store), saved.resume);
    }
    await offline.deleteFormsResume(saved.resume);
    assert.equal((await offline.formsResume()).resume, null);
  }
);

test(
  'save receipts must confirm the selected bytes, new revision, size, name and PDF media type',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    const saved = (await saveConfiguredResume(store, { file })).resume;
    const next = { ...saved, revision: globalThis.crypto.randomUUID() };
    for (const resume of [
      saved,
      { ...next, name: 'other.pdf' },
      { ...next, size: saved.size + 1 },
      { ...next, sha256: 'a'.repeat(64) },
      { ...next, type: 'text/plain' },
    ]) {
      const api = createFormResumeApi({
        report: async () => ({ ok: true, resume }),
      });
      await assert.rejects(
        api.saveFormsResume({ file, revision: saved.revision })
      );
    }
    const api = createFormResumeApi({
      report: async () => ({ ok: true, resume: { ...next, data: file.data } }),
    });
    assert.deepEqual(
      (await api.saveFormsResume({ file, revision: saved.revision })).resume,
      next
    );
  }
);

test(
  'saved-PDF status uses the refusal-preserving reader and never falls back after a refusal',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    let localReads = 0;
    const api = createFormResumeApi({
      get: () => assert.fail('generic read discards server refusals'),
      getResume: async () => ({ ok: false, code: 'fixture-refused' }),
      local: async () => {
        localReads++;
        return store;
      },
    });
    await assert.rejects(api.formsResume(), { code: 'fixture-refused' });
    assert.equal(localReads, 0);
  }
);
