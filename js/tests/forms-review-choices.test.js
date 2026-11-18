import test from 'node:test';
import assert from 'node:assert/strict';
import { formChoiceEnvironment } from './helpers/forms-choice-fixture.mjs';
import { expandableReviewField } from '../src/forms/review-custom.js';
import { formReviewHttp } from './helpers/forms-review-http.mjs';
import { createFormsCommands } from '../src/cli/forms-commands.js';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { isReadRequest } from '../src/web/request-policy.js';

test(
  'closed choices are explicitly inspected once and require a new application plan',
  { timeout: 5000 },
  async () => {
    const env = await formChoiceEnvironment();
    try {
      const plan = await env.plan();
      assert.equal(plan.fields[0].answer.inspectOptionsSupported, true);
      assert.equal(plan.fields[0].answer.applySupported, false);
      assert.equal(env.clicks, 0);
      const result = await env.disclose(plan);
      assert.equal(result.state, 'opened');
      assert.equal(result.report.fields[0].value, 'hi');
      assert.equal(env.clicks, 1);
      assert.deepEqual((await env.disclose(plan)).report, result.report);
      assert.equal(env.clicks, 1);
      await assert.rejects(
        env.reader.applyReview({
          id: plan.reviewPlan.sessionId,
          planId: plan.reviewPlan.id,
          fields: [env.field.id],
          replaceExisting: true,
        }),
        { code: 'form-plan-expired' }
      );
      const fresh = await env.plan();
      assert.equal(fresh.fields[0].answer.applySupported, true);
    } finally {
      await env.reader.stop();
    }
  }
);

test(
  'owner edits and replaced targets refuse disclosure before clicking',
  { timeout: 5000 },
  async () => {
    for (const changed of ['value', 'target']) {
      const env = await formChoiceEnvironment();
      try {
        const plan = await env.plan();
        if (changed === 'value') {
          env.field.displayValue = 'Owner changed this';
        } else {
          env.hooks.check = () => {
            throw Object.assign(new Error('Replaced'), {
              code: 'form-changed',
            });
          };
        }
        const result = await env.disclose(plan);
        assert.equal(result.state, 'refused');
        assert.equal(result.code, 'form-changed');
        assert.equal(env.clicks, 0);
        assert.equal(env.disposed, 1);
      } finally {
        await env.reader.stop();
      }
    }
  }
);

test(
  'an issued disclosure with lost acknowledgement or changed answer remains uncertain without replay',
  { timeout: 5000 },
  async () => {
    for (const outcome of ['lost', 'answer', 'closed']) {
      const env = await formChoiceEnvironment();
      try {
        const plan = await env.plan();
        env.hooks.click = () => {
          if (outcome === 'lost') {
            throw new Error('Lost reply');
          }
          env.field.optionsExpanded = outcome !== 'closed';
          env.field.displayValue = outcome === 'answer' ? 'English' : 'Hindi';
          for (const option of env.field.options) {
            option.visible = true;
          }
        };
        const result = await env.disclose(plan);
        assert.equal(result.state, 'uncertain');
        assert.equal((await env.disclose(plan)).state, 'uncertain');
        assert.equal(env.clicks, 1);
      } finally {
        await env.reader.stop();
      }
    }
  }
);

test('only readable closed comboboxes advertise disclosure', () => {
  const field = { type: 'combobox', optionsDisclosure: true };
  assert(expandableReviewField(field));
  for (const mutation of [
    { optionsDisclosure: false },
    { disabled: true },
    { readOnly: true },
    { valueOmitted: 'password' },
    { type: 'listbox' },
  ]) {
    assert.equal(expandableReviewField({ ...field, ...mutation }), false);
  }
});

test(
  'text/binary Lino disclosure requires trusted mutation and preserves one-click recovery',
  { timeout: 10000 },
  async () => {
    for (const media of [LINO_TEXT, LINO_BINARY]) {
      const env = await formChoiceEnvironment();
      await env.reader.stop();
      const { server, base, post } = await formReviewHttp(env.options, media);
      try {
        const opened = await post('open', { url: env.report.url });
        const plan = await post('plan', {
          id: opened.session.id,
          profileId: env.profile.id,
        });
        const body = {
          id: opened.session.id,
          planId: plan.reviewPlan.id,
          fieldId: env.field.id,
        };
        assert.equal(
          (
            await post('disclose', body, {
              origin: 'https://untrusted.example',
            })
          ).code,
          'forbidden'
        );
        assert.equal(env.clicks, 0);
        const result = await post('disclose', body);
        assert.equal(result.state, 'opened');
        assert.deepEqual((await post('disclose', body)).report, result.report);
        assert.equal(env.clicks, 1);
        assert.equal(
          isReadRequest(`${base}/api/forms/sessions/disclose`, 'POST'),
          false
        );
      } finally {
        await server.close();
      }
    }
  }
);

test(
  'interactive CLI exposes the same explicit choice-inspection command',
  { timeout: 5000 },
  async () => {
    const env = await formChoiceEnvironment();
    await env.reader.stop();
    const output = [];
    const commands = createFormsCommands({
      ...env.options,
      openStore: async () => env.options.store,
      async *reviewInput() {
        yield 'plan form-1';
        const plan = output.find((item) => item.mode === 'answer-plan');
        yield `disclose form-1 ${plan.reviewPlan.id} ${env.field.id}`;
        yield 'quit';
      },
    });
    assert.equal(
      await commands['forms-review'](
        { url: env.report.url, 'profile-id': env.profile.id },
        (line) => output.push(JSON.parse(line))
      ),
      0
    );
    assert.equal(
      output.find((item) => item.mode === 'choices-result').state,
      'opened'
    );
    assert.equal(env.clicks, 1);
  }
);
