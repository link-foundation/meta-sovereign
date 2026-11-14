import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import {
  applicationRunFixture,
  applicationIdentity,
} from './application-run-fixture.mjs';
import { createVacancyService } from '../../js/src/jobs/service.js';
import { applicationDelay } from '../../js/src/jobs/application-options.js';

export const batchUrls = [
  'https://hh.ru/vacancy/123',
  'https://hh.ru/vacancy/456',
];
export const batchInput = {
  urls: batchUrls,
  requestId: 'fixture-batch',
  autoSelectResumeLanguage: false,
  autoExact: false,
  reviewDelayMs: 0,
  confirmations: [],
  applicationIntervalSeconds: 2,
  confirm: true,
};
const configureBatchFilling = (f) => {
  const { state } = f;
  const filling = f.serviceOptions.application.filling;
  for (const operation of ['inspect', 'plan']) {
    const original = filling[operation];
    filling[operation] = async (...args) => {
      for (const field of state.fields) {
        field.answer.preserveCurrent = field.value !== '';
      }
      return original(...args);
    };
  }
  filling.restore = async (_record, fields, check, guard) => {
    check();
    await guard();
    const receipts = fields.map((field) => {
      const native = state.fields.find((peer) => peer.id === field.id);
      const unchanged = native.value === field.answer.proposal.value;
      if (!unchanged && !native.value) {
        native.value = field.answer.proposal.value;
      }
      return {
        status: unchanged
          ? 'unchanged'
          : native.value === field.answer.proposal.value
            ? 'applied'
            : 'refused',
      };
    });
    return {
      ok: receipts.every((row) => row.status !== 'refused'),
      state: 'refused',
      receipts,
    };
  };
};
export const applicationBatchFixture = (t, configuration = {}) => {
  const f = applicationRunFixture(configuration);
  const { state } = f;
  state.clock = Date.parse('2026-11-14T10:00:00Z');
  state.admissions = [];
  state.documents = 0;
  state.waits = 0;
  state.genericErrors = 0;
  state.unknownSend = false;
  state.questionnaires = new Set(configuration.questionnaires ?? batchUrls);
  const open = f.serviceOptions.application.openSession;
  const form = (url) => {
    const id =
      new URL(url).searchParams.get('vacancyId') ?? url.split('/').at(-1);
    state.page.url = `https://hh.ru/applicant/vacancy_response?vacancyId=${id}`;
    state.page.enter = null;
    state.page.submit = {
      qa: 'vacancy-response-letter-submit',
      tag: 'BUTTON',
      href: null,
      text: 'Send',
      disabled: false,
    };
    state.page.scope = true;
    state.page.scopeStructureKey = 'batch-form';
    state.page.questions = state.questionnaires.has(
      `https://hh.ru/vacancy/${id}`
    );
    state.page.fieldIndices = state.page.questions ? [1] : [];
    configuration.form?.(state);
  };
  configureBatchFilling(f);
  f.serviceOptions.application = {
    ...f.serviceOptions.application,
    now: () => state.clock,
    batchWait: async (ms, signal) => {
      state.waits++;
      await applicationDelay(1, signal);
      state.clock += ms;
    },
    openSession: async (input) => {
      const browser = await open(input);
      browser.page.waitForURL = async (predicate) => {
        assert(predicate(new URL(state.page.url)));
      };
      browser.page.waitForFunction = async (_predicate, input) => {
        assert.notEqual(input.documentKey, state.page.documentKey);
      };
      const goto = browser.commander.goto;
      browser.commander.goto = async (input) => {
        await goto(input);
        state.documents++;
        state.page.documentKey = `batch-document-${state.documents}`;
        for (const field of state.fields) {
          field.value = '';
        }
        state.admissions.push({ url: input.url, at: state.clock });
        if (input.url.includes('/applicant/vacancy_response')) {
          form(input.url);
        }
      };
      return browser;
    },
    dispatch: async (_handle, _record, action) => {
      if (action === 'fullForm') {
        form(state.page.url);
        return { navigated: true };
      }
      if (action === 'limitRefresh') {
        state.refreshes = (state.refreshes ?? 0) + 1;
        state.page.documentKey = `batch-limit-refreshed-${state.refreshes}`;
        state.page.dailyLimit = false;
        state.page.error = null;
        for (const field of state.fields) {
          field.value = '';
        }
        return { navigated: true };
      }
      if (action === 'submit') {
        state.submitted++;
        if (state.unknownSend) {
          throw Object.assign(new Error('Lost Send acknowledgement'), {
            code: 'fixture-send-lost',
          });
        }
        if (state.dailyLimits) {
          state.dailyLimits--;
          state.page.dailyLimit = true;
        } else if (state.genericErrors) {
          state.genericErrors--;
          state.page.error = 'generic-error';
        } else {
          state.page.delivered = true;
        }
      }
      return { dispatched: true };
    },
    limitWait: async (ms, signal) => {
      await applicationDelay(1, signal);
      state.clock += ms;
    },
    ...configuration.application,
  };
  f.service = createVacancyService(f.serviceOptions);
  t.after(() => f.close());
  f.status = () =>
    f.service['application-batch-status']({
      browserSlot: 'jobs',
      requestId: batchInput.requestId,
    });
  f.start = (options = {}) =>
    f.service['application-batch-start']({ ...batchInput, ...options });
  f.stop = () => f.service['application-batch-stop'](batchInput);
  f.until = async (predicate) => {
    for (let count = 0; count < 200; count++) {
      const receipt = await f.status();
      if (predicate(receipt)) {
        return receipt;
      }
      if (receipt.batch && !receipt.batch.active) {
        assert.fail(JSON.stringify(receipt.batch));
      }
      await delay(5);
    }
    assert.fail(
      `Finite batch predicate was not reached: ${JSON.stringify((await f.status()).batch)}`
    );
  };
  f.mode = async (change) => {
    const receipt = await f.status();
    return f.service['application-batch-mode']({
      ...batchInput,
      ...change,
      revision: receipt.batch.revision,
    });
  };
  f.confirm = async (step) => {
    const receipt = await f.status();
    return f.service['application-continue'](
      applicationIdentity(receipt.application, { step, confirm: true })
    );
  };
  return f;
};
