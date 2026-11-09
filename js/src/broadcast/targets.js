import { codedError } from '../sources/http.js';

export const TARGET_PREFIX = 'broadcast-target:';
export const BROADCAST_MODES = Object.freeze({
  telegram: ['auto', 'bot', 'user'],
  vk: ['user', 'community'],
  x: ['auto', 'oauth1-user', 'oauth2-user', 'app-only'],
});
const kinds = {
  telegram: ['channel', 'group'],
  vk: ['personal-wall', 'community-wall'],
  x: ['account'],
};
const allowed = new Set([
  'id',
  'label',
  'network',
  'kind',
  'destination',
  'authMode',
  'format',
  'enabled',
  'fromGroup',
  'signed',
  'version',
  'updatedAt',
  'tokens',
]);
const bad = (message) => {
  throw codedError(message, 'bad-target');
};

export const targetId = (id) => {
  const key = String(id ?? '').replace(/^broadcast-target:/, '');
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(key)) {
    bad(
      'A destination ID must contain 1–80 letters, digits, dashes or underscores'
    );
  }
  return `${TARGET_PREFIX}${key}`;
};

const destinationOf = (network, kind, value) => {
  const destination = String(value ?? '').trim();
  if (network === 'x') {
    if (destination) {
      bad(
        'X publishes as the authenticated account; no destination ID is needed'
      );
    }
    return '';
  }
  if (network === 'vk') {
    const pattern =
      kind === 'community-wall' ? /^-[1-9]\d{0,18}$/ : /^[1-9]\d{0,18}$/;
    if (!pattern.test(destination)) {
      bad('VK wall ID must match the personal/community destination type');
    }
  } else if (
    !/^(?:-?[1-9]\d{0,18}|@[a-zA-Z][a-zA-Z0-9_]{3,31})$/.test(destination)
  ) {
    bad('A Telegram destination needs a numeric chat ID or @username');
  }
  return destination;
};

const flagsOf = (input, network, kind) => {
  for (const key of ['enabled', 'fromGroup', 'signed']) {
    if (input[key] !== undefined && typeof input[key] !== 'boolean') {
      bad(`${key} must be boolean`);
    }
  }
  const fromGroup = input.fromGroup ?? kind === 'community-wall';
  const signed = input.signed ?? false;
  if (
    (fromGroup || signed) &&
    (network !== 'vk' || kind !== 'community-wall')
  ) {
    bad('Community authorship requires a VK community wall');
  }
  if (signed && !fromGroup) {
    bad('A signed VK post must be authored by the community');
  }
  return {
    enabled: input.enabled ?? true,
    ...(network === 'vk' ? { fromGroup, signed } : {}),
  };
};

const shapeOf = (input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    bad('A destination must be an object');
  }
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    bad('Destination contains an unknown field; save credentials separately');
  }
  const { network, kind } = input;
  if (!Object.hasOwn(kinds, network) || !kinds[network].includes(kind)) {
    bad('Choose a supported network and destination type');
  }
  return { network, kind };
};

/** Saved destinations contain routing and presentation only, never credentials. */
export const normalizeTarget = (input = {}) => {
  const { network, kind } = shapeOf(input);
  const label = typeof input.label === 'string' ? input.label.trim() : '';
  if (!label || label.length > 120) {
    bad('A destination label needs 1–120 characters');
  }
  const authMode = input.authMode ?? BROADCAST_MODES[network][0];
  if (!BROADCAST_MODES[network].includes(authMode)) {
    bad('Authentication mode does not match the destination network');
  }
  const format = input.format ?? 'plain';
  if (
    !['plain', 'html'].includes(format) ||
    (format === 'html' && network !== 'telegram')
  ) {
    bad('HTML formatting is available for Telegram destinations');
  }
  if (
    network === 'vk' &&
    kind === 'personal-wall' &&
    authMode === 'community'
  ) {
    bad('A community credential cannot publish on a personal wall');
  }
  return {
    id: targetId(input.id),
    label,
    network,
    kind,
    destination: destinationOf(network, kind, input.destination),
    authMode,
    format,
    ...flagsOf(input, network, kind),
  };
};

export const listTargets = (store) =>
  store.query((link) => link?.id?.startsWith(TARGET_PREFIX));

export const saveTarget = async (store, input) => {
  const target = {
    ...normalizeTarget(input),
    tokens: ['broadcast-target'],
    version: globalThis.crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
  };
  await store.put(target);
  return target;
};

export const removeTarget = async (store, id) => {
  const key = targetId(id);
  await store.delete(key);
  return { ok: true, id: key };
};

const checkSelection = (targetIds, all) => {
  if (
    targetIds !== undefined &&
    (!Array.isArray(targetIds) || targetIds.length > 100)
  ) {
    bad('Choose at most 100 destination IDs');
  }
  if (typeof all !== 'boolean') {
    bad('all must be boolean');
  }
  if (all && targetIds?.length) {
    bad('Choose destination IDs or all enabled destinations');
  }
};

export const selectTargets = async (store, input = {}) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    bad('A publication selection must be an object');
  }
  const { targetIds, all = false } = input;
  checkSelection(targetIds, all);
  const selected = all
    ? (await listTargets(store)).filter((t) => t.enabled)
    : await Promise.all(
        (Array.isArray(targetIds) ? targetIds : []).map((id) =>
          store.get(targetId(id))
        )
      );
  if (!selected.length || selected.length > 100) {
    bad('Select 1–100 saved destinations');
  }
  if (selected.some((t) => !t || !t.enabled)) {
    bad('A selected destination is missing or disabled');
  }
  if (new Set(selected.map((t) => t.id)).size !== selected.length) {
    bad('A destination may be selected only once');
  }
  return selected.map((t) => ({ ...normalizeTarget(t), version: t.version }));
};
