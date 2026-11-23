import { attentionPageForeground } from '../automation/attention-foreground.js';

const currentAttention = ({ kind, id, requestId, browserSlot }, result) =>
  result?.ok === true && Array.isArray(result.attention)
    ? result.attention.find(
        (item) =>
          item.kind === kind &&
          item.id === id &&
          item.requestId === requestId &&
          item.browserSlot === browserSlot
      )
    : undefined;

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
    async browserState(item) {
      if (!allowed() || !Object.hasOwn(sources, item.kind)) {
        return { active: false, focused: false };
      }
      const focused = await attentionPageForeground(item);
      const source = sources[item.kind];
      const notice = allowed() && currentAttention(item, await source.read());
      const active = allowed() && Boolean(notice);
      return {
        active,
        focused: active && notice.focusAvailable === true && focused,
      };
    },
    async focus(item) {
      if (!allowed() || !Object.hasOwn(sources, item.kind)) {
        return { ok: false };
      }
      const source = sources[item.kind];
      const notice = currentAttention(item, await source.read());
      return allowed() && notice?.focusAvailable
        ? source.focus(notice)
        : { ok: false };
    },
  };
};
