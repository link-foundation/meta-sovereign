import { applicationLimitDraftFixture } from './application-limit-draft-fixture.mjs';
import { applicationLimitDocument } from '../../js/src/jobs/application-limit-document.js';
import { readFormDocument } from '../../js/src/forms/read-document.js';
import { createVacancyService } from '../../js/src/jobs/service.js';

/** Existing draft/queue integration with finite native admission fault injection. */
export const applicationLimitChallengeFixture = async (test, options = {}) => {
  let browser;
  const fixture = applicationLimitDraftFixture(test, options);
  const open = fixture.serviceOptions.openSession;
  fixture.serviceOptions.openSession = async (input) => {
    browser = await open(input);
    return browser;
  };
  fixture.service = createVacancyService(fixture.serviceOptions);
  const receipt = await fixture.answered();
  const { state } = fixture;
  const original = browser.commander.evaluate;
  const capture = {
    valid: true,
    closes: 0,
    disposed: 0,
    beforeClose: null,
    read: null,
    targets: 1,
    candidate: null,
    dismiss: null,
    report: (raw) => raw,
  };
  const guard = () => JSON.stringify([state.page.documentKey, state.fields]);
  browser.commander.evaluate = async ({ fn, args }) => {
    if (fn === applicationLimitDocument) {
      await capture.read?.();
      return capture.valid ? { guard: guard() } : null;
    }
    if (fn === readFormDocument) {
      return capture.report({
        url: state.page.url,
        documentKey: 'form-document',
        title: '',
        intro: '',
        scope: 'hh-limit-application-form',
        fields: globalThis
          .structuredClone(state.fields.slice(1))
          .map((field, index) => ({
            ...field,
            id: `field-${index + 1}`,
          })),
        reasons: [],
        navigation: { nextPage: false, limited: false },
      });
    }
    return original({ fn, args });
  };
  browser.page.$$ = async () =>
    Array.from({ length: capture.targets }, (_, index) => ({
      evaluate: async (_fn, input) => {
        await (input.action === 'candidate'
          ? capture.candidate?.(index)
          : capture.dismiss?.());
        if (!capture.valid || input.guard !== guard()) {
          return null;
        }
        if (input.action === 'candidate') {
          return { candidate: true };
        }
        await capture.beforeClose?.();
        capture.closes++;
        state.page.challenge = false;
        state.page.scope = true;
        return { requested: true };
      },
      dispose: async () => {
        capture.disposed++;
      },
    }));
  state.page.challenge = true;
  state.page.scope = false;
  state.page.dailyLimit = true;
  return { ...fixture, receipt, capture };
};
