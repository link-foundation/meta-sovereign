/** Explicit form actions preserve server refusals and never retry invisibly. */
import { createFormResumeApi } from './form-resume-api.js';
export const createFormsApi = ({ get, getResume, report, local }) => ({
  ...createFormResumeApi({ get, getResume, report, local }),
  formsCapabilities: async () =>
    (await get('/api/forms/capabilities')) ?? {
      available: false,
      reason: 'server-required',
      read: false,
      plan: false,
      review: false,
      fill: false,
      submit: false,
    },
  formsRead: async (options) =>
    (await report('/api/forms/read', options, { network: true })) ?? {
      ok: false,
      code: 'server-required',
    },
  formsPlan: async (options) =>
    (await report('/api/forms/plan', options, { network: true })) ?? {
      ok: false,
      code: 'server-required',
    },
  formsReviews: async () =>
    (await get('/api/forms/sessions')) ?? {
      ok: false,
      code: 'server-required',
    },
  formsPrefillStatus: async ({ id, requestId }) =>
    (await get(
      `/api/forms/sessions/prefill?${new URLSearchParams({ id, requestId })}`
    )) ?? { ok: false, code: 'server-required' },
  ...Object.fromEntries(
    [
      'Open',
      'Read',
      'History',
      'Focus',
      'Close',
      'Plan',
      'Apply',
      'Prefill',
      'Disclose',
      'Attach',
      'Capacity',
    ].map((action) => [
      `forms${action}Review`,
      async (options) =>
        (await report(`/api/forms/sessions/${action.toLowerCase()}`, options, {
          network: true,
        })) ?? { ok: false, code: 'server-required' },
    ])
  ),
});
