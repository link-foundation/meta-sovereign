// The automation editor's form (issue #31 / PR #34): an automation as
// flat, editable strings and booleans, and back. Unknown fields (a
// preset id, a neutral template, the incoming flags, extra pacing) are
// kept from the automation being edited, so the form never loses what
// it does not show. Pure, so it is tested without React.

import {
  automationKey,
  automationPresets,
  normalizeAutomation,
} from '../automation/automations.js';
import { formatAudienceSpec, parseAudienceSpec } from '../crm/people.js';

const DEFAULT_AUDIENCE = { kind: 'personal' };

const PRESETS = automationPresets();

/**
 * A preset's name in the user's language while it still is the stored
 * (English) default; a name the user chose is shown as it is. Works on
 * names alone, so drafts and typing status that only carry the name
 * are translated too.
 */
export const presetName = (t, name) => {
  const preset = PRESETS.find((p) => p.name === name);
  return preset ? t(`automations.presets.${preset.preset}.name`) : name;
};

/** An automation with its untouched preset name and description translated. */
export const localizePreset = (t, automation) => {
  const preset = PRESETS.find((p) => p.preset === automation.preset);
  if (!preset) {
    return automation;
  }
  const text = (field) =>
    automation[field] === preset[field]
      ? t(`automations.presets.${preset.preset}.${field}`)
      : automation[field];
  return {
    ...automation,
    name: text('name'),
    description: text('description'),
  };
};

const triggerOf = (automation, kind) =>
  (automation.triggers ?? []).find((t) => t.kind === kind) ?? null;

const numberText = (value) =>
  value === null || value === undefined ? '' : String(value);

const seconds = (ms) => numberText(ms === undefined ? ms : ms / 1000);

/** An automation (saved or preset) as the editor's fields. */
export const toForm = (input) => {
  const a = normalizeAutomation(input);
  const c = a.conditions;
  const p = a.pacing;
  return {
    id: automationKey(a),
    name: a.name,
    description: a.description,
    enabled: a.enabled,
    mode: a.mode,
    manual: Boolean(triggerOf(a, 'manual')),
    chatMenu: Boolean(triggerOf(a, 'chat-menu')),
    schedule: triggerOf(a, 'schedule')?.every ?? '',
    incoming: triggerOf(a, 'incoming')?.pattern ?? '',
    audience: formatAudienceSpec(a.audience ?? DEFAULT_AUDIENCE),
    silentDays: numberText(c.silentDays),
    cooldownDays: numberText(c.cooldownDays),
    mutual: Boolean(c.mutual),
    personal: Boolean(c.personal),
    lastFrom: c.lastFrom ?? 'any',
    networks: (c.networks ?? []).join(', '),
    form: a.action.form,
    informal: a.action.templates.informal ?? '',
    formal: a.action.templates.formal ?? '',
    dailyCap: numberText(p.dailyCap),
    minDelay: seconds(p.minDelayMs),
    maxDelay: seconds(p.maxDelayMs),
    typing: Boolean(p.typing),
    limit: numberText(a.limit),
  };
};

const csv = (text) =>
  String(text ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const toNumber = (text, fallback) => {
  const value = String(text ?? '').trim();
  return value === '' ? fallback : Number(value);
};

// Triggers keep the order they had in `base`; new ones go last.
const triggersFrom = (form, base) => {
  const incoming = triggerOf(base, 'incoming');
  const order = (base.triggers ?? []).map((t) => t.kind);
  const rank = (t) =>
    order.includes(t.kind) ? order.indexOf(t.kind) : order.length;
  return [
    form.manual && { kind: 'manual' },
    form.chatMenu && { kind: 'chat-menu' },
    form.schedule.trim() && { kind: 'schedule', every: form.schedule.trim() },
    form.incoming.trim() && {
      kind: 'incoming',
      pattern: form.incoming.trim(),
      ...(incoming?.flags ? { flags: incoming.flags } : {}),
    },
  ]
    .filter(Boolean)
    .sort((a, b) => rank(a) - rank(b));
};

const templatesFrom = (form, base) => {
  const templates = { ...base.action?.templates };
  for (const key of ['informal', 'formal']) {
    if (form[key].trim()) {
      templates[key] = form[key];
    } else {
      delete templates[key];
    }
  }
  return templates;
};

/** The editor's fields back into an automation, over `base`. */
export const fromForm = (form, base = {}) => ({
  ...base,
  id: form.id,
  name: form.name,
  description: form.description,
  enabled: form.enabled,
  mode: form.mode,
  triggers: triggersFrom(form, base),
  audience: form.audience.trim()
    ? parseAudienceSpec(form.audience)
    : DEFAULT_AUDIENCE,
  conditions: {
    ...base.conditions,
    silentDays: toNumber(form.silentDays, 0),
    cooldownDays: toNumber(form.cooldownDays, null),
    mutual: form.mutual,
    personal: form.personal,
    lastFrom: form.lastFrom,
    networks: csv(form.networks).length ? csv(form.networks) : null,
  },
  action: {
    ...base.action,
    form: form.form,
    templates: templatesFrom(form, base),
  },
  pacing: {
    ...base.pacing,
    dailyCap: toNumber(form.dailyCap, 50),
    minDelayMs: toNumber(form.minDelay, 20) * 1000,
    maxDelayMs: toNumber(form.maxDelay, 60) * 1000,
    typing: form.typing,
  },
  limit: toNumber(form.limit, 20),
});

const NUMBER_FIELDS = [
  'silentDays',
  'cooldownDays',
  'dailyCap',
  'minDelay',
  'maxDelay',
  'limit',
];

/**
 * `{ automation }` ready to save or run, or `{ error, field }` — `error`
 * is a translation key with `detail` from the parser when it has one.
 */
export const checkForm = (form, base = {}) => {
  if (!form.name.trim()) {
    return { error: 'automations.error.name', field: 'name' };
  }
  const bad = NUMBER_FIELDS.find((key) => {
    const value = String(form[key] ?? '').trim();
    return value !== '' && !(Number(value) >= 0);
  });
  if (bad) {
    return { error: 'automations.error.number', field: bad };
  }
  const input = (() => {
    try {
      return fromForm(form, base);
    } catch (error) {
      return { error: error.message };
    }
  })();
  if (input.error) {
    return {
      error: 'automations.error.audience',
      field: 'audience',
      detail: input.error,
    };
  }
  if (input.triggers.length === 0) {
    return { error: 'automations.error.trigger', field: 'manual' };
  }
  try {
    return { automation: normalizeAutomation(input) };
  } catch (error) {
    return { error: 'automations.error.invalid', detail: error.message };
  }
};

/** A new automation to start from: a hello to every personal chat. */
export const blankAutomation = (name = 'New automation') =>
  normalizeAutomation({
    id: `custom-${Date.now().toString(36)}`,
    name,
    triggers: [{ kind: 'manual' }, { kind: 'chat-menu' }],
    conditions: { silentDays: 90, mutual: true },
  });

/** `[{ reason, count }]`, the most common reason first. */
export const exclusionSummary = (excluded = []) => {
  const counts = new Map();
  for (const { reason } of excluded) {
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
};

/** Where a selected person is messaged: their 1:1 chat, else the user. */
export const targetsFor = (people = []) =>
  people.map((p) => ({
    source: p.source,
    chat: String(p.personalChat ?? p.user),
  }));

/** `person:vk:1 | person:tg:2` — the selection as an audience. */
export const selectionAudience = (people = []) =>
  people.length
    ? formatAudienceSpec({ kind: 'people', keys: people.map((p) => p.key) })
    : '';
