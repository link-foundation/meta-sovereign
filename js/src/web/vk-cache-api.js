import { inspectVkCache } from '../sources/vk-cache-shape.js';
import { activeAccount } from './telegram-account-scope.js';

export const createVkCacheApi = ({ report, local }) => {
  const unavailable = () => ({ ok: false, code: 'server-required' });
  const call = (action, input) =>
    report(`/api/vk/cache/${action}`, input, { network: true });
  return {
    async inspectVkCache(input) {
      const account = activeAccount();
      const answer = await call('inspect', input);
      if (answer) {
        return answer;
      }
      if (account !== 1 || activeAccount() !== 1) {
        return unavailable();
      }
      const store = await local();
      if (activeAccount() !== 1) {
        return unavailable();
      }
      return { ...(await inspectVkCache(store, input)), offline: true };
    },
    refreshVkCache: async (input) =>
      (await call('refresh', input)) ?? unavailable(),
    exportVkCache: async (input) =>
      (await call('export', input)) ?? unavailable(),
  };
};
