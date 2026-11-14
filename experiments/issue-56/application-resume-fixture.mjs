import { resumeLanguageFixture } from './resume-language-fixture.mjs';
import { resumeListFixture } from './resume-list-fixture.mjs';
import { applicationFixture } from './application-fixture.mjs';
import { applicationIdentity } from './application-run-fixture.mjs';
import {
  applicationResumeChooserFixture,
  applicationResumeOptions,
} from './application-resume-options-fixture.mjs';

/** Only the form controls are mocked; checked export bytes use real bounded files. */
export const applicationResumeFixture = async (t, options = {}) => {
  const evidence = await resumeLanguageFixture();
  let fixture;
  let selected = 'russian-old';
  const change = (hash) => {
    const chooser = fixture.state.page.resumeChooser;
    chooser.title = chooser.options.find((row) => row.hash === hash).title;
    chooser.options = chooser.options.map((row) => ({
      ...row,
      checked: row.hash === hash,
    }));
    selected = hash;
    fixture.state.resumeWrites++;
  };
  try {
    fixture = applicationFixture({
      store: evidence.store,
      application: {
        artifactRoot: evidence.artifactRoot,
        selectResume: async (_target, _record, hash) => {
          if (options.ineffective !== true) {
            change(hash);
          }
          return { dispatched: true };
        },
      },
    });
    const dispatch = fixture.serviceOptions.application.dispatch;
    fixture.serviceOptions.application.dispatch = async (
      target,
      record,
      action
    ) => {
      if (action === 'resumeMenu') {
        const chooser = fixture.state.page.resumeChooser;
        chooser.open = !chooser.open;
        chooser.options = chooser.open
          ? applicationResumeOptions().map((row) => ({
              ...row,
              checked: row.hash === selected,
            }))
          : [];
        fixture.state.menuClicks++;
        return { dispatched: true };
      }
      return dispatch(target, record, action);
    };
    // Replace the not-yet-open service so its injected dispatch observes this fixture.
    await fixture.service.stop();
    if (options.vacancy) {
      const open = fixture.serviceOptions.openSession;
      fixture.serviceOptions.openSession = async (input) => {
        const browser = await open(input);
        const evaluate = browser.commander.evaluate;
        browser.commander.evaluate = async (...args) => ({
          ...(await evaluate(...args)),
          ...options.vacancy,
        });
        return browser;
      };
    }
    const { createVacancyService } =
      await import('../../js/src/jobs/service.js');
    fixture.service = createVacancyService(fixture.serviceOptions);
    fixture.state.menuClicks = 0;
    fixture.state.resumeWrites = 0;
    fixture.state.page.resumeChooser = applicationResumeChooserFixture();
    fixture.state.page.questionIndices = [1];
    await evidence.store.put({
      id: 'jobs-resumes:jobs',
      version: 1,
      ...resumeListFixture(),
    });
    const close = fixture.close.bind(fixture);
    fixture.close = async () => {
      try {
        await close();
      } finally {
        await evidence.close();
      }
    };
    t?.after(() => fixture.close());
    if (options.enter !== false) {
      fixture.entered = await fixture.enter(
        fixture.service,
        options.application
      );
    }
    fixture.choose = (receipt, extra = {}) =>
      fixture.service['application-resume'](
        applicationIdentity(receipt, {
          action: 'choose',
          resume: 'english',
          confirm: true,
          ...extra,
        })
      );
    fixture.menu = (receipt, extra = {}) =>
      fixture.service['application-resume'](
        applicationIdentity(receipt, {
          action: 'menu',
          confirm: true,
          ...extra,
        })
      );
    fixture.context = (receipt, extra = {}) =>
      fixture.service['application-resume'](
        applicationIdentity(receipt, {
          action: 'context',
          confirm: true,
          ...extra,
        })
      );
    return { ...evidence, ...fixture };
  } catch (error) {
    try {
      await fixture?.close();
    } finally {
      await evidence.close();
    }
    throw error;
  }
};
