/** In-process desktop access to the same live owners used by the Lino routes. */
export const serverOwnerAttention = (ctx) => {
  const allowed = () => !ctx.vacanciesClosing && !ctx.passcode.locked();
  const sources = {
    captcha: {
      read: () => ctx.forms.reviewAttention(),
      focus: ({ id, requestId }) => ctx.forms.focusReview(id, requestId),
    },
    'hh-application-verification': {
      read: () => ctx.vacancies?.['application-attention'](),
      focus: (item) => ctx.vacancies?.['application-attention-focus'](item),
    },
    'hh-manual-login': {
      read: () => ctx.vacancies?.['login-attention'](),
      focus: (item) => ctx.vacancies?.['login-attention-focus'](item),
    },
  };
  return {
    async read() {
      if (!allowed()) {
        return [];
      }
      const results = await Promise.allSettled(
        Object.values(sources).map(async (source) => source.read())
      );
      return allowed()
        ? results.flatMap((result) =>
            result.status === 'fulfilled' &&
            result.value?.ok === true &&
            Array.isArray(result.value.attention)
              ? result.value.attention
              : []
          )
        : [];
    },
    async focus({ kind, id, requestId, browserSlot }) {
      if (!allowed() || !Object.hasOwn(sources, kind)) {
        return { ok: false };
      }
      const source = sources[kind];
      const result = await source.read();
      const notice =
        result?.ok === true &&
        result.attention?.find(
          (item) =>
            item.kind === kind &&
            item.id === id &&
            item.requestId === requestId &&
            item.browserSlot === browserSlot &&
            item.focusAvailable
        );
      return allowed() && notice ? source.focus(notice) : { ok: false };
    },
  };
};
