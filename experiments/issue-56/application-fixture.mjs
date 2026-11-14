import { createMemoryStore } from '../../js/src/storage/universal.js';
import { createVacancyService } from '../../js/src/jobs/service.js';
import {
  formModelField,
  formModelInspection,
} from '../../js/tests/helpers/forms-plan-inspection.mjs';
import { vacancySnapshotFixture, vacancyUrl } from './vacancy-fixture.mjs';

export const applicationInput = {
  url: vacancyUrl,
  requestId: 'fixture-application',
};
const descriptor = (qa) => ({
  qa,
  tag: 'BUTTON',
  href: null,
  text: 'Apply',
  disabled: false,
});
export const applicationPageFixture = () => ({
  bound: true,
  url: vacancyUrl,
  documentKey: 'fixture-document',
  challenge: false,
  dailyLimit: false,
  external: false,
  delivered: false,
  questions: false,
  enter: descriptor('vacancy-response-link-top'),
  submit: null,
  letter: null,
  letterToggle: null,
  ambiguousLetter: false,
  scope: false,
  scopeKey: 'native-form-1',
  fieldIndices: [],
});
const field = (label, index, value, source = 'exact') =>
  formModelField(label, {
    tag: 'input',
    index,
    value,
    answer: {
      source,
      complete: true,
      effects: [],
      missing: [],
      preserveCurrent: value !== '',
      proposal: { value: 'Reviewed answer' },
    },
  });
/** Finite service fault injection; native DOM admission is tested separately. */
export const applicationFixture = ({
  store = createMemoryStore(),
  application = {},
  readSearch,
} = {}) => {
  const state = {
    page: applicationPageFixture(),
    calls: [],
    fields: [field('Header search', 0, ''), field('Recent experience', 1, '')],
    submitted: 0,
    entered: 0,
    writes: [],
    closed: 0,
    opened: 0,
    disposed: 0,
  };
  const inspection = () => ({
    ...formModelInspection(globalThis.structuredClone(state.fields)),
    url: vacancyUrl,
    frames: [{ id: 'frame-1', parent: null, url: vacancyUrl, reasons: [] }],
    navigation: { nextPage: false, limited: false },
  });
  const filling = {
    clear: async (record) => {
      record.reviewPlan = null;
    },
    inspect: async () => inspection(),
    plan: async (record, options, check) => {
      check();
      state.calls.push(['plan', options]);
      record.reviewPlan = { inspection: inspection() };
      return {
        ...inspection(),
        mode: 'answer-plan',
        reviewPlan: { id: 'fixture-plan' },
      };
    },
    apply: async (_record, input, check) => {
      check();
      for (const id of input.fields) {
        state.writes.push(id);
        state.fields.find((field) => field.id === id).value = 'Reviewed answer';
      }
    },
  };
  const serviceOptions = {
    store,
    ...(readSearch ? { readSearch } : {}),
    storeDir: '/tmp/application-fixture',
    openSession: async (options) => {
      state.opened++;
      state.calls.push(['open', options]);
      return {
        page: {},
        commander: {
          goto: async () => {},
          evaluate: async () => vacancySnapshotFixture(),
        },
        close: async () => {
          state.closed++;
        },
      };
    },
    application: {
      filling,
      readPage: async () => globalThis.structuredClone(state.page),
      target: async () => ({
        dispose: async () => {
          state.disposed++;
        },
      }),
      dispatch: async (_handle, _record, action) => {
        if (action === 'enter') {
          state.entered++;
          state.page.enter = null;
          state.page.submit = descriptor('vacancy-response-submit-popup');
          state.page.scope = true;
          state.page.questions = true;
          state.page.fieldIndices = [1];
        } else if (action === 'submit') {
          state.submitted++;
          state.page.delivered = true;
        }
        return { dispatched: true };
      },
      writeLetter: async (_browser, value) => {
        if (state.page.letter?.value) {
          return 'owner-conflict';
        }
        state.page.letter = { value, index: 2, disabled: false };
        return 'verified';
      },
      ...application,
    },
  };
  return {
    state,
    store,
    serviceOptions,
    service: createVacancyService(serviceOptions),
    async enter(service = this.service, input = {}) {
      const opened = await service['application-open']({
        ...applicationInput,
        ...input,
      });
      return service['application-advance']({
        ...applicationInput,
        revision: opened.revision,
        action: 'enter',
        confirm: true,
      });
    },
    async close() {
      await this.service.stop();
      await store.close?.();
    },
  };
};
