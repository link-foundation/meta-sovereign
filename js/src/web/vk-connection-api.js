import { activeAccount } from './telegram-account-scope.js';

/** Shared connected/offline acknowledgement and primary-account admission. */
export const createVkConnectionApi = (
  { get, report, local },
  path,
  load,
  save
) => {
  const unavailable = () => ({ ok: false, error: 'server required' });
  const offline = async (account, operation) => {
    if (account !== 1 || activeAccount() !== 1) {
      return unavailable();
    }
    const store = await local();
    if (activeAccount() !== 1) {
      return unavailable();
    }
    return {
      ...(await operation(store)),
      schedulerRunning: false,
      canRun: false,
    };
  };
  return {
    async load() {
      const account = activeAccount();
      return (await get(path)) ?? offline(account, load);
    },
    async save(settings) {
      const account = activeAccount();
      return (
        (await report(path, settings, { network: true })) ??
        offline(account, (store) => save(store, settings))
      );
    },
    async action(name, body) {
      return (
        (await report(`${path}/${name}`, body, { network: true })) ??
        unavailable()
      );
    },
  };
};

export const createVkReviewedJobApi = (options, name, { load, save }) => {
  const api = createVkConnectionApi(options, `/api/vk/${name}`, load, save);
  const title = `Vk${name[0].toUpperCase()}${name.slice(1)}`;
  return {
    [`vk${title.slice(2)}`]: api.load,
    [`save${title}`]: api.save,
    [`plan${title}`]: () => api.action('plan', {}),
    [`run${title}`]: (planId) => api.action('run', { planId, confirm: true }),
  };
};
