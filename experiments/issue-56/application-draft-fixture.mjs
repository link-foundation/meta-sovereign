import { createReviewedPrefill } from '../../js/src/forms/review-prefill.js';
import { createVacancyService } from '../../js/src/jobs/service.js';
import {
  formModelField,
  formModelInspection,
} from '../../js/tests/helpers/forms-plan-inspection.mjs';
import { applicationRecoveryFixture } from './application-recovery-fixture.mjs';

/** Finite fault injection around the production draft planning/write/readback path. */
export const applicationDraftFixture = (options = {}) => {
  const fixture = applicationRecoveryFixture(options);
  const { state } = fixture;
  const hooks = {};
  state.fields.push(
    formModelField('Cover letter', {
      tag: 'textarea',
      type: 'textarea',
      index: 2,
    })
  );
  const originalOpen = fixture.serviceOptions.openSession;
  const originalDispatch = fixture.serviceOptions.application.dispatch;
  const bindLetter = () => {
    state.page.scopeStructureKey = 'native-draft-fixture-form';
    state.page.letter = {
      value: state.fields[2].value,
      index: 2,
      disabled: false,
    };
    state.page.fieldIndices = state.fields
      .filter((field) => field.index > 0)
      .map((field) => field.index);
  };
  const filling = createReviewedPrefill({
    store: fixture.store,
    inspect: async (_browser, input) => {
      input.check();
      input.onSnapshot?.({});
      await hooks.inspect?.();
      const report = {
        ...formModelInspection(globalThis.structuredClone(state.fields)),
        url: state.page.url,
        frames: [
          { id: 'frame-1', parent: null, url: state.page.url, reasons: [] },
        ],
        navigation: { nextPage: false, limited: false },
      };
      return hooks.report ? hooks.report(report) : report;
    },
    capture: async () => ({
      check: async () => hooks.targets?.(),
      dispose: async () => {
        state.disposed++;
      },
      get: (id) => id,
    }),
    write: async (_browser, _handle, field) => {
      state.writes.push(field.id);
      await hooks.write?.(field);
      Object.assign(
        state.fields.find((entry) => entry.id === field.id),
        field.answer.proposal
      );
      const current = state.fields.find((entry) => entry.id === field.id);
      if (field.tag === 'select') {
        current.options = current.options.map((option) => ({
          ...option,
          selected: option.value === current.value,
        }));
      }
      if (field.type === 'radio' && field.answer.proposal.checked) {
        for (const peer of state.fields) {
          if (
            peer.type === 'radio' &&
            peer.radioGroup?.id === field.radioGroup.id
          ) {
            peer.checked = peer.id === field.id;
          }
        }
      }
      bindLetter();
    },
  });
  fixture.serviceOptions.openSession = async (input) => {
    const browser = await originalOpen(input);
    const goto = browser.commander.goto;
    browser.commander.goto = async (input) => {
      await goto(input);
      for (const field of state.fields) {
        if (field.index > 0) {
          if (['checkbox', 'radio'].includes(field.type)) {
            field.checked = false;
          } else {
            field.value = '';
          }
        }
      }
      if (state.page.scope) {
        bindLetter();
      }
    };
    return browser;
  };
  fixture.serviceOptions.application = {
    ...fixture.serviceOptions.application,
    filling,
    readPage: async () => {
      if (state.page.scope) {
        bindLetter();
      }
      return globalThis.structuredClone(state.page);
    },
    dispatch: async (...args) => {
      const result = await originalDispatch(...args);
      if (args[2] === 'enter') {
        bindLetter();
      }
      return result;
    },
  };
  fixture.service = createVacancyService(fixture.serviceOptions);
  return Object.assign(fixture, { hooks });
};
