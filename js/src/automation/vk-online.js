/** Owned user-token online refresh; positive provider acknowledgement is required. */
import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { getSource, liveOptionsFrom } from '../sources/index.js';
import { safeMessage } from '../server/redact.js';
import { traceTrigger } from './trigger-log.js';
import { createStoreQueue } from '../storage/serialized.js';
import {
  VK_ONLINE_STATE as STATE,
  readVkOnlineSettings as settingsOf,
  readVkOnlineSnapshot as snapshot,
} from './vk-online-settings.js';
export { loadVkOnline, saveVkOnline } from './vk-online-settings.js';

// Provider waits serialize with other refreshes, never with owner settings.
const enqueue = createStoreQueue();

export const createVkOnlineJob = ({
  store,
  resolve = getSource,
  optionsFor = () => liveOptionsFrom(store, 'vk'),
  now = Date.now,
  setInterval = globalThis.setInterval,
  clearInterval = globalThis.clearInterval,
  log = () => {},
} = {}) => {
  let stopped = false;
  let timer;
  let active = null;
  const perform = async (settings) => {
    let options = {};
    const attemptedAt = new Date(now()).toISOString();
    const pending = { id: STATE, attemptedAt, status: 'pending' };
    // A failed intent write must prevent the provider effect.
    await saveAcknowledgedRecord(store, pending);
    let outcome;
    try {
      options = (await optionsFor()) ?? {};
      const live = resolve('vk')?.live;
      if (!options.token || typeof live?.setOnline !== 'function') {
        throw Object.assign(
          new Error('VK user token and online API required'),
          { code: 'unavailable' }
        );
      }
      const beforeIssue = async () => {
        const freshOptions = (await optionsFor()) ?? {};
        const freshSettings = await settingsOf(store);
        if (
          stopped ||
          options.token !== freshOptions.token ||
          settings.enabled !== freshSettings.enabled ||
          settings.everyMinutes !== freshSettings.everyMinutes
        ) {
          throw Object.assign(
            new Error(
              'Online refresh policy, credentials or lifecycle changed'
            ),
            { code: 'policy-changed' }
          );
        }
      };
      const reply = await live.setOnline(options, beforeIssue);
      if (reply?.confirmed !== true) {
        throw Object.assign(new Error('VK did not confirm online status'), {
          code: 'unconfirmed',
        });
      }
      outcome = {
        ...pending,
        status: 'confirmed',
        confirmedAt: new Date(now()).toISOString(),
      };
    } catch (error) {
      outcome = {
        ...pending,
        status:
          error.vkCode || ['unavailable', 'policy-changed'].includes(error.code)
            ? 'refused'
            : 'unknown',
        code: String(error.code ?? 'provider-failed'),
        error: safeMessage(error)
          .split(options.token ?? '\0')
          .join('<redacted>')
          .slice(0, 300),
      };
    }
    // If this fails, the durable pending intent remains unknown on restart.
    await saveAcknowledgedRecord(store, outcome);
    log({
      event: 'vk_online_refresh',
      status: outcome.status,
      code: outcome.code,
    });
    return snapshot(store);
  };
  const run = ({ scheduled = false } = {}) => {
    // Coalesce overlapping timer/manual requests for this service instance.
    if (active) {
      return active;
    }
    active = enqueue(store, async () => {
      if (stopped) {
        return { ...(await snapshot(store)), skipped: 'stopped' };
      }
      const settings = await settingsOf(store);
      if (scheduled) {
        const last = await store.get(STATE);
        const elapsed = now() - Date.parse(last?.attemptedAt ?? '');
        if (
          !settings.enabled ||
          (Number.isFinite(elapsed) && elapsed < settings.everyMinutes * 60000)
        ) {
          return { ...(await snapshot(store)), skipped: 'not-due' };
        }
      }
      return perform(settings);
    }).finally(() => {
      active = null;
    });
    return active;
  };
  return {
    run,
    start() {
      if (timer || stopped) {
        return;
      }
      timer = setInterval(
        () =>
          traceTrigger(log, STATE, () => run({ scheduled: true })).catch(() =>
            log({ event: 'vk_online_storage_failed' })
          ),
        60000
      );
      // The scheduled job owns process lifetime until stop() clears its timer.
    },
    async stop() {
      stopped = true;
      clearInterval(timer);
      await active?.catch(() => {});
    },
  };
};
