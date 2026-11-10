/** Explicit read-only actions preserve server refusals and never retry invisibly. */
export const createFormsApi = ({ get, report }) => ({
  formsCapabilities: async () =>
    (await get('/api/forms/capabilities')) ?? {
      available: false,
      reason: 'server-required',
      read: false,
      plan: false,
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
});
