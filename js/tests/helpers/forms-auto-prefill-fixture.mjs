import { createFormReader } from '../../src/forms/reader.js';
import { formUploadEnvironment } from './forms-upload-fixture.mjs';

export const automaticFormEnvironment = async (count = 2, settings = {}) => {
  const env = await formUploadEnvironment();
  await env.reader.stop();
  const writes = [];
  const template = {
    ...env.field,
    type: 'text',
    value: '',
    valueOmitted: null,
  };
  delete template.upload;
  env.report.fields.unshift(
    ...Array.from({ length: count }, (_, i) => ({
      ...template,
      id: `frame-1:text-${i}`,
      index: i + 1,
      label: i ? 'Email' : 'Full name',
    }))
  );
  const prefill = env.options.review.prefill;
  const options = {
    ...env.options,
    ...settings,
    review: {
      prefill: {
        ...prefill,
        capture: async (...args) => ({
          ...(await prefill.capture(...args)),
          get: (id) => id,
        }),
        write: async (_browser, _target, field) => {
          writes.push(field.id);
          await env.hooks.textWrite?.(field);
          const current = env.report.fields.find(
            (item) => item.id === field.id
          );
          Object.assign(current, field.answer.proposal);
        },
      },
    },
  };
  const reader = createFormReader(options);
  const { session } = await reader.openReview({ url: env.report.url });
  return {
    ...env,
    options,
    reader,
    textWrites: writes,
    session,
    prefill: (extra = {}) =>
      reader.prefillReview({
        id: session.id,
        requestId: globalThis.crypto.randomUUID(),
        profileId: env.profile.id,
        ...extra,
      }),
    get uploads() {
      return env.writes;
    },
  };
};
