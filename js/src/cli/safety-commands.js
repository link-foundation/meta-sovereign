import { defaultStoreDir } from '../storage/app-directory.js';
import {
  loadSettings,
  normalizeSettings,
  saveSettings,
} from '../automation/safety.js';
import { encodeWire } from '../transport/lino.js';

const CONFIG = [
  'quiet-enabled',
  'quiet-from',
  'quiet-to',
  'timezone',
  'cooldown-days',
];
const TARGET = ['source', 'chat', 'contact', 'note'];

const cooldown = (value, saved) => {
  if (value === undefined) {
    return saved;
  }
  if (value === 'none') {
    return null;
  }
  const parsed = Number(value);
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    !Number.isFinite(parsed) ||
    parsed < 0
  ) {
    throw new Error('--cooldown-days must be nonnegative or none.');
  }
  return parsed;
};

const configure = (saved, args) => {
  if (!CONFIG.some((key) => args[key] !== undefined)) {
    throw new Error('safety configure requires a setting to change.');
  }
  const quietHours = { ...saved.quietHours };
  if (args['quiet-enabled'] !== undefined) {
    if (![true, false, 'true', 'false'].includes(args['quiet-enabled'])) {
      throw new Error('--quiet-enabled must be true or false.');
    }
    quietHours.enabled = [true, 'true'].includes(args['quiet-enabled']);
  }
  for (const field of ['from', 'to']) {
    const value = args[`quiet-${field}`];
    if (value !== undefined) {
      if (
        typeof value !== 'string' ||
        !/^([01]?\d|2[0-3]):[0-5]\d$/u.test(value)
      ) {
        throw new Error(`--quiet-${field} must be HH:MM.`);
      }
      quietHours[field] = value;
    }
  }
  const timezone =
    args.timezone === undefined
      ? saved.timezone
      : args.timezone === 'local'
        ? null
        : args.timezone;
  if (
    timezone !== null &&
    normalizeSettings({ timezone }).timezone !== timezone
  ) {
    throw new Error('--timezone must be an IANA time zone or local.');
  }
  return {
    ...saved,
    quietHours,
    timezone,
    cooldownDays: cooldown(args['cooldown-days'], saved.cooldownDays),
  };
};

const target = (args) => {
  const fields = ['chat', 'contact'].filter((key) => args[key] !== undefined);
  if (
    typeof args.source !== 'string' ||
    !args.source.trim() ||
    fields.length !== 1 ||
    typeof args[fields[0]] !== 'string' ||
    !args[fields[0]].trim()
  ) {
    throw new Error(
      'Opt-out requires --source and exactly one of --chat or --contact.'
    );
  }
  if (
    args.note !== undefined &&
    (typeof args.note !== 'string' || args.note.length > 200)
  ) {
    throw new Error('--note must be text of at most 200 characters.');
  }
  return { source: args.source.trim(), [fields[0]]: args[fields[0]].trim() };
};

const optOut = (saved, args, remove) => {
  const selected = target(args);
  const matches = (entry) =>
    entry.source === selected.source &&
    entry.chat === selected.chat &&
    entry.contact === selected.contact;
  const existing = saved.optOut.find(matches);
  const others = saved.optOut.filter((entry) => !matches(entry));
  if (remove) {
    return { ...saved, optOut: others };
  }
  if (others.length >= 5000) {
    throw new Error('The opt-out list is full; no entry was changed.');
  }
  const entry = {
    ...selected,
    note: args.note?.trim() ?? existing?.note ?? '',
    at: existing ? existing.at : new Date().toISOString(),
  };
  return { ...saved, optOut: [...others, entry] };
};

/** Global safeguards use the same acknowledged record as the UI and API. */
export const safetyCommands = async ({
  args,
  log,
  openStore,
  openReadOnly = openStore,
}) => {
  const action = args._[1] ?? 'show';
  if (
    !['show', 'configure', 'opt-out-add', 'opt-out-remove'].includes(action) ||
    args._.length > 2
  ) {
    throw new Error(
      'safety expects show, configure, opt-out-add or opt-out-remove.'
    );
  }
  const allowed = new Set([
    '_',
    'store',
    'json',
    ...(action === 'configure'
      ? CONFIG
      : action === 'show'
        ? []
        : TARGET.filter((key) => action === 'opt-out-add' || key !== 'note')),
  ]);
  if (Object.keys(args).some((key) => !allowed.has(key))) {
    throw new Error('Unsupported safety option; see automations help.');
  }
  const store = await (action === 'show' ? openReadOnly : openStore)(
    args.store ?? defaultStoreDir()
  );
  try {
    const saved = await loadSettings(store);
    const answer =
      action === 'show'
        ? saved
        : await saveSettings(
            store,
            action === 'configure'
              ? configure(saved, args)
              : optOut(saved, args, action === 'opt-out-remove')
          );
    log(args.json ? JSON.stringify(answer, null, 2) : encodeWire(answer));
    return 0;
  } finally {
    await store.close?.();
  }
};
