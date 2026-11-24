import { EventEmitter } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { createVacancyService } from '../../js/src/jobs/service.js';

export const jobLoginInput = (extra = {}) => ({
  browserSlot: 'account-two',
  requestId: 'manual-login',
  ...extra,
});
export const jobLoginFixture = () => {
  const store = createMemoryStore();
  const page = new EventEmitter();
  const calls = {
    launches: [],
    navigations: [],
    closes: 0,
    focuses: 0,
    traces: [],
  };
  let pageClosed = false;
  page.isClosed = () => pageClosed;
  page.bringToFront = async () => {
    calls.focuses++;
  };
  const timers = new Map();
  let time = Date.parse('2026-11-17T17:00:00Z');
  let launch, navigation, closing;
  const browser = {
    page,
    commander: {
      goto: async (options) => {
        calls.navigations.push(options);
        await navigation?.();
      },
    },
    close: async () => {
      calls.closes++;
      await closing?.();
      pageClosed = true;
    },
  };
  const options = {
    store,
    storeDir: '/synthetic/login-workspace',
    availability: async () => ({ available: true }),
    openSession: async (input) => {
      calls.launches.push(input);
      await launch?.();
      pageClosed = false;
      return browser;
    },
    login: {
      now: () => time,
      setTimer: (callback, duration) => {
        const timer = { callback, duration };
        timers.set(timer, timer);
        return timer;
      },
      clearTimer: (timer) => timers.delete(timer),
      trace: (state) => calls.traces.push(state),
    },
  };
  const service = createVacancyService(options);
  return {
    store,
    page,
    options,
    service,
    calls,
    timers,
    beforeLaunch: (value) => {
      launch = value;
    },
    beforeNavigation: (value) => {
      navigation = value;
    },
    beforeClose: (value) => {
      closing = value;
    },
    closeNativePage: () => {
      pageClosed = true;
      page.emit('close');
    },
    advance: (value) => {
      time += value;
    },
    async wait(state, input = jobLoginInput()) {
      for (let i = 0; i < 100; i++) {
        const result = await service['login-status'](input);
        if (result.login?.state === state) {
          return result;
        }
        await delay(2);
      }
      throw new Error(`Manual login never reached ${state}`);
    },
  };
};
