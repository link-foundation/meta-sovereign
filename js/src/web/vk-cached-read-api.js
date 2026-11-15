import { activeAccount } from './telegram-account-scope.js';

export const vkCachedReadApi = ({ report, local }, resource, inspect) => {
  const unavailable = () => ({ ok: false, code: 'server-required' });
  const call = (action, input) =>
    report(`/api/vk/${resource}/${action}`, input, { network: true });
  return {
    async inspect(input) {
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
      return { ...(await inspect(store, input)), offline: true };
    },
    refresh: async (input) => (await call('refresh', input)) ?? unavailable(),
    export: async (input) => (await call('export', input)) ?? unavailable(),
  };
};
