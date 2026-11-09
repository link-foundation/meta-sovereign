import { RECOVERY_FORMATS, recoveryFormats } from './recovery-dump.js';

export const RECOVERY_SETTINGS_ID = 'config:recovery';
export const MAX_RECOVERY_HOURS = Math.floor(0x7fffffff / 3_600_000);
const bad = () =>
  Object.assign(new Error('invalid recovery settings'), {
    code: 'BACKUP_SETTINGS',
  });

export const validateRecoverySettings = (value) => {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw bad();
  }
  const { intervalHours, keep, formats } = value;
  if (
    !Number.isFinite(intervalHours) ||
    intervalHours < 0 ||
    intervalHours > MAX_RECOVERY_HOURS ||
    !Number.isInteger(keep) ||
    keep < 0 ||
    keep > 10_000 ||
    !Array.isArray(formats)
  ) {
    throw bad();
  }
  return { intervalHours, keep, formats: recoveryFormats(formats) };
};

export const readRecoverySettings = async (store, defaults = {}) => {
  const fallback = {
    intervalHours: 24,
    keep: 3,
    formats: [...RECOVERY_FORMATS],
    ...defaults,
  };
  const saved = await store.get(RECOVERY_SETTINGS_ID);
  return saved
    ? validateRecoverySettings(saved)
    : validateRecoverySettings(fallback);
};

export const saveRecoverySettings = async (store, value) => {
  const settings = validateRecoverySettings(value);
  await store.put({
    id: RECOVERY_SETTINGS_ID,
    tokens: ['config', 'recovery'],
    ...settings,
  });
  return settings;
};
