import {
  loadVkOnline,
  saveVkOnline,
} from '../automation/vk-online-settings.js';
import { activeAccount } from './telegram-account-scope.js';

export const createVkOnlineApi = ({ get, report, local }) => {
  const offline = async (account, operation) => {
    const unavailable = { ok: false, error: 'server required' };
    if (account !== 1 || activeAccount() !== 1) {
      return unavailable;
    }
    const store = await local();
    if (activeAccount() !== 1) {
      return unavailable;
    }
    return {
      ...(await operation(store)),
      schedulerRunning: false,
      canRun: false,
    };
  };
  return {
    async vkOnline() {
      const account = activeAccount();
      return (await get('/api/vk/online')) ?? offline(account, loadVkOnline);
    },
    async saveVkOnline(settings) {
      const account = activeAccount();
      return (
        (await report('/api/vk/online', settings, { network: true })) ??
        offline(account, (store) => saveVkOnline(store, settings))
      );
    },
    async runVkOnline() {
      return (
        (await report('/api/vk/online/run', {}, { network: true })) ?? {
          ok: false,
          error: 'server required',
        }
      );
    },
  };
};
