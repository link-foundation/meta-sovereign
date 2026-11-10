/** Explicit form actions preserve server refusals and never retry invisibly. */
export const createFormsApi = ({ get, report }) => ({
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
  ...Object.fromEntries(
    ['Open', 'Read', 'Focus', 'Close', 'Plan', 'Apply'].map((action) => [
      `forms${action}Review`,
      async (options) =>
        (await report(`/api/forms/sessions/${action.toLowerCase()}`, options, {
          network: true,
        })) ?? { ok: false, code: 'server-required' },
    ])
  ),
});
