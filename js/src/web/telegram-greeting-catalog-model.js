// A refresh is explicit. Unmounting releases UI reads; the account owns its job.
export const catalogRunning = (job) =>
  ['running', 'cancelling'].includes(job?.state);
const readCatalog = async (api, page) => {
  const data = await api.telegramGreetingStickersStatus(page);
  if (!data?.ok) {
    throw Object.assign(new Error('catalog-read'), { code: data?.code });
  }
  return {
    data,
    offset: data.offset,
    greetingsOnly: page.greetingsOnly,
    availability: 'ready',
  };
};
const errorCode = (error) =>
  [
    'busy',
    'bad-request',
    'user-account-required',
    'stopped',
    'read-failed',
  ].includes(error?.code)
    ? error.code
    : 'offline';

export const createGreetingCatalogModel = (api, changed = () => {}) => {
  const state = {
    availability: 'loading',
    busy: false,
    data: null,
    error: null,
    offset: 0,
    greetingsOnly: true,
  };
  let live = false;
  let revision = 0;
  let timer = null;
  const page = (patch = {}) => ({
    offset: state.offset,
    limit: 100,
    greetingsOnly: state.greetingsOnly,
    ...patch,
  });
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
        state.error = errorCode(error);
      }
      return false;
    } finally {
      if (live && epoch === revision) {
        state.busy = false;
        changed();
      }
    }
  };
  const load = () =>
    perform(async () => {
      if (
        [
          'telegramStatus',
          'telegramGreetingStickersStatus',
          'telegramGreetingStickersRefresh',
          'telegramGreetingStickersCancel',
        ].some((name) => typeof api[name] !== 'function')
      ) {
        return { availability: 'unavailable', data: null };
      }
      const status = await api.telegramStatus();
      if (
        status?.kind !== 'user' ||
        status?.capabilities?.greetingStickersRefresh !== true
      ) {
        return { availability: 'unavailable', data: null };
      }
      return readCatalog(api, page());
    });
  const refresh = (options) =>
    perform(async () => {
      const answer = await api.telegramGreetingStickersRefresh(options);
      if (!answer?.ok) {
        throw Object.assign(new Error('catalog-refresh'), {
          code: answer?.code,
        });
      }
      return readCatalog(api, page({ offset: 0 }));
    });
  const cancel = () =>
    perform(async () => {
      const answer = await api.telegramGreetingStickersCancel();
      if (!answer?.ok) {
        throw Object.assign(new Error('catalog-cancel'), {
          code: answer?.code,
        });
      }
      return readCatalog(api, page());
    });
  const start = () => {
    globalThis.clearInterval(timer);
    live = true;
    revision += 1;
    state.busy = false;
    const loaded = load();
    timer = globalThis.setInterval(() => {
      if (state.availability === 'ready' && catalogRunning(state.data?.job)) {
        perform(() => readCatalog(api, page()));
      }
    }, 1500);
    return loaded;
  };
  const stop = () => {
    live = false;
    revision += 1;
    state.busy = false;
    globalThis.clearInterval(timer);
  };
  return {
    state,
    start,
    stop,
    load,
    refresh,
    cancel,
    read: (patch) => perform(() => readCatalog(api, page(patch))),
  };
};
