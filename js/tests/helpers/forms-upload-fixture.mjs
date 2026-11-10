import { createFormReader } from '../../src/forms/reader.js';
import { formChoiceEnvironment } from './forms-choice-fixture.mjs';
import { resumePdf } from '../../src/forms/resume-upload.js';
import { syntheticResumePdf } from '../../../experiments/issue-56/forms-resume-fixture.mjs';

export const formUploadEnvironment = async () => {
  const base = await formChoiceEnvironment();
  await base.reader.stop();
  const { field, report } = base;
  for (const key of [
    'displayValue',
    'optionsComplete',
    'optionsExpanded',
    'optionsDisclosure',
  ]) {
    delete field[key];
  }
  Object.assign(field, {
    type: 'file',
    label: 'Resume PDF',
    value: null,
    valueOmitted: 'file',
    options: [],
    upload: { accept: '.pdf', directory: false, complete: true, files: [] },
  });
  const file = {
    name: 'synthetic-resume.pdf',
    data: syntheticResumePdf().toString('base64'),
  };
  const hooks = {};
  let writes = 0;
  let disposed = 0;
  let actual;
  const options = {
    ...base.options,
    review: {
      prefill: {
        inspect: async (_browser, input) => {
          input.check();
          input.onSnapshot?.({});
          await hooks.inspect?.();
          return globalThis.structuredClone(report);
        },
        capture: async () => ({
          check: async () => hooks.check?.(),
          dispose: async () => {
            disposed++;
          },
          control: () => ({
            setInputFiles: async (payload) => {
              writes++;
              if (hooks.write) {
                return hooks.write(payload);
              }
              actual = resumePdf({
                name: payload.name,
                data: payload.buffer.toString('base64'),
              }).metadata;
              field.upload.files = [
                {
                  name: actual.name,
                  size: actual.size,
                  type: actual.type,
                  lastModified: 0,
                },
              ];
            },
            evaluate: async () => (hooks.read ? hooks.read() : actual),
          }),
        }),
      },
    },
  };
  const reader = createFormReader(options);
  const opened = await reader.openReview({ url: report.url });
  return {
    ...base,
    reader,
    options,
    hooks,
    file,
    plan: () =>
      reader.planReview({ id: opened.session.id, profileId: base.profile.id }),
    attach: (plan, overrides = {}) =>
      reader.attachReview({
        id: opened.session.id,
        planId: plan.reviewPlan.id,
        fieldId: field.id,
        file,
        ...overrides,
      }),
    get writes() {
      return writes;
    },
    get disposed() {
      return disposed;
    },
  };
};
