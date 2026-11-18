const supports = (api, status) =>
  status?.kind === 'user' &&
  status.capabilities?.greetingSendPreview === true &&
  ['telegramGreetingSendPreview', 'telegramGreetingSendApply'].every(
    (name) => typeof api[name] === 'function'
  );
const requestError = (answer) =>
  Object.assign(new Error('greeting-request'), {
    code: answer?.code ?? 'offline',
  });
export const createGreetingSendModel = (api, changed = () => {}) => {
  const state = {
    availability: 'loading',
    busy: false,
    error: null,
    plan: null,
    result: null,
    draft: { chat: '', operation: 'greeting-sticker', sticker: null },
  };
  let live = false;
  let revision = 0;
  let draftVersion = 0;
  const perform = async (use) => {
    if (!live || state.busy) {
      return false;
    }
    const epoch = revision;
    state.busy = true;
    state.error = null;
    changed();
    try {
      const patch = await use();
      if (live && epoch === revision) {
        Object.assign(state, patch);
      }
      return live && epoch === revision;
    } catch (error) {
      if (live && epoch === revision) {
        state.error = error.code ?? 'offline';
      }
      return false;
    } finally {
      if (live && epoch === revision) {
        state.busy = false;
        changed();
      }
    }
  };
  const available = async () => supports(api, await api.telegramStatus?.());
  const unavailable = () => ({
    availability: 'unavailable',
    plan: null,
    result: null,
  });
  const load = () =>
    perform(async () =>
      (await available()) ? { availability: 'ready' } : unavailable()
    );
  const update = (patch) => {
    if (state.busy) {
      return;
    }
    state.draft = { ...state.draft, ...patch };
    draftVersion += 1;
    state.plan = null;
    state.result = null;
    state.error = null;
    changed();
  };
  const preview = () =>
    perform(async () => {
      if (!(await available())) {
        return unavailable();
      }
      const version = draftVersion;
      const draft = { ...state.draft };
      if (draft.operation === 'bot-start') {
        draft.sticker = null;
      }
      const plan = await api.telegramGreetingSendPreview(draft);
      if (!plan?.ok) {
        throw requestError(plan);
      }
      return version === draftVersion
        ? { plan, result: null, availability: 'ready' }
        : {};
    });
  const apply = () => {
    const plan = state.plan;
    if (!plan?.willSend || state.busy) {
      return Promise.resolve(false);
    }
    return perform(async () => {
      // A lost response must not leave an enabled Send button for the same plan.
      state.plan = null;
      changed();
      let result;
      try {
        result = await api.telegramGreetingSendApply({
          planId: plan.planId,
          confirm: true,
        });
      } catch {
        result = { ok: false, status: 'unknown', code: 'response-unavailable' };
      }
      if (!result?.status) {
        throw requestError(result);
      }
      return { result };
    });
  };
  return {
    state,
    load,
    update,
    preview,
    apply,
    start: () => {
      live = true;
      revision += 1;
      state.busy = false;
      return load();
    },
    stop: () => {
      live = false;
      revision += 1;
      state.busy = false;
    },
  };
};
