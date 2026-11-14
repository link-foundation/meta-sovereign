import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationBatchAtSend } from '../../experiments/issue-56/application-batch-fixture.mjs';
import { applicationPanelMarkup } from './helpers/application-controls.mjs';

const confirmation = (markup) =>
  markup.match(/<input[^>]*data-application-option="confirm"[^>]*>/u)?.[0];
const control = (markup, name) =>
  markup.match(
    new RegExp(`<button[^>]*data-application-action="${name}"[^>]*>`, 'u')
  )?.[0];

test(
  'an active batch keeps its own followed review operable across four locales',
  { timeout: 5000 },
  async (t) => {
    const { f, receipt } = await applicationBatchAtSend(t);
    const application = {
      receipt: receipt.application,
      intent: receipt.application,
      known: true,
      options: {},
      batch: { receipt, known: true, busy: false },
    };
    for (const locale of ['en', 'ru', 'hi', 'zh']) {
      const markup = applicationPanelMarkup(application, locale, {
        busy: 'application-batch',
      });
      assert(confirmation(markup));
      assert.doesNotMatch(confirmation(markup), /\bdisabled/u);
      assert.doesNotMatch(control(markup, 'read'), /\bdisabled/u);
      // Enabling owner confirmation does not itself authorize sending.
      assert.match(control(markup, 'confirm-step'), /\bdisabled/u);
    }
    assert.equal(f.state.submitted, 0);
  }
);

test(
  'an advanced batch permits status and inactive identity release without enabling old actions',
  { timeout: 5000 },
  async (t) => {
    const { f, receipt } = await applicationBatchAtSend(t);
    const review = receipt.application;
    const batch = {
      ...receipt,
      application: { ...review, url: 'https://hh.ru/vacancy/456' },
    };
    for (const active of [true, false]) {
      const markup = applicationPanelMarkup(
        {
          receipt: { ...review, active },
          intent: review,
          known: true,
          options: {},
          batch: { receipt: batch, known: true, busy: false },
        },
        'en',
        { busy: 'application-batch' }
      );
      assert.doesNotMatch(control(markup, 'recover'), /\bdisabled/u);
      assert.equal(/\bdisabled/u.test(control(markup, 'release')), active);
      for (const name of ['reopen', 'continue', 'confirm-step', 'read']) {
        assert.match(control(markup, name), /\bdisabled/u);
      }
      assert.match(confirmation(markup), /\bdisabled/u);
    }
    assert.equal(f.state.submitted, 0);
  }
);

test(
  'batch ownership cannot enable a different, inactive or already busy review',
  { timeout: 5000 },
  async (t) => {
    const { f, receipt } = await applicationBatchAtSend(t);
    const review = receipt.application;
    const variants = [
      ...['url', 'requestId', 'browserSlot'].map((key) => ({
        review: { ...review, [key]: `${review[key]}-different` },
      })),
      { review: { ...review, active: false } },
      { batch: { ...receipt, batch: { ...receipt.batch, active: false } } },
      { batch: { ...receipt, application: null } },
      { busy: true },
      { workspace: 'discovery' },
      { workspace: 'collect' },
      { workspace: 'application-continue' },
    ];
    for (const row of variants) {
      const markup = applicationPanelMarkup(
        {
          receipt: row.review ?? review,
          intent: review,
          busy: row.busy ?? false,
          known: true,
          options: {},
          batch: { receipt: row.batch ?? receipt, busy: false, known: true },
        },
        'en',
        { busy: row.workspace ?? 'application-batch' }
      );
      assert.match(confirmation(markup), /\bdisabled/u, JSON.stringify(row));
      assert.match(control(markup, 'confirm-step'), /\bdisabled/u);
    }
    assert.equal(f.state.submitted, 0);
  }
);
