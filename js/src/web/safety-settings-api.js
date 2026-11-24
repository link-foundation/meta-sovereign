import {
  normalizeSettings,
  loadSettings,
  saveSettings,
} from '../automation/safety.js';

const PATH = '/api/automations/settings';
const unconfirmed = () =>
  Object.assign(new Error('Safety settings were not confirmed.'), {
    code: 'safety-settings-unconfirmed',
  });

const confirmed = (value, expected) => {
  if (
    !value ||
    value.error ||
    value.ok === false ||
    value.status === 'failed'
  ) {
    throw unconfirmed();
  }
  const settings = normalizeSettings(value);
  if (
    Object.keys(settings).some(
      (key) => JSON.stringify(value[key]) !== JSON.stringify(settings[key])
    ) ||
    (expected && JSON.stringify(settings) !== JSON.stringify(expected))
  ) {
    throw unconfirmed();
  }
  return settings;
};

/** Only an absent server permits local fallback, never a lost/refused response. */
export const safetySettingsApi = ({ remote, store }) => {
  const call = async (method, settings) => {
    if (!remote.request) {
      return method === 'GET' ? remote.get(PATH) : remote.put(PATH, settings);
    }
    const response = await remote.request(
      PATH,
      {
        method,
        ...(settings
          ? {
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(settings),
            }
          : {}),
      },
      { network: true, recover: method === 'GET' }
    );
    if (!response) {
      return null;
    }
    if (!response.ok) {
      throw unconfirmed();
    }
    return confirmed(await response.json().catch(() => null), settings);
  };
  return {
    safetySettings: async () => {
      const answer = await call('GET');
      return answer === null ? loadSettings(store) : confirmed(answer);
    },
    saveSafetySettings: async (input) => {
      const settings = normalizeSettings(input);
      const answer = await call('PUT', settings);
      return answer === null
        ? saveSettings(store, settings)
        : confirmed(answer, settings);
    },
  };
};
