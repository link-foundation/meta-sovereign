import { createVkSequenceJob } from './vk-sequence-job.js';
import { greetDecision } from './vk-greet-planner.js';
import { questionVariants } from './vk-reengage-settings.js';
import { vkMessageRandomId } from './vk-message-random.js';
import {
  vkBirthdaySettings,
  birthdayDate,
  birthdayStickers,
  birthdayAttachments,
} from './vk-birthday-settings.js';

export const birthdayDecision = (state, settings, previous, now, cycle) => {
  const date = birthdayDate(now, settings.timeZone);
  if (date !== cycle) {
    return 'dateChanged';
  }
  const match =
    typeof state.birthday === 'string' &&
    /^(\d{1,2})\.(\d{1,2})(?:\.([1-9]\d{3}))?$/u.exec(state.birthday);
  if (!match) {
    return state.birthday === null || state.birthday === undefined
      ? 'birthdayPrivate'
      : 'birthdayInvalid';
  }
  const [, day, month, year] = match.map(Number);
  // Yearless dates use a leap year, so February 29 is retained accurately.
  const value = new Date(Date.UTC(year || 2000, month - 1, day));
  if (
    value.getUTCMonth() !== month - 1 ||
    value.getUTCDate() !== day ||
    year > Number(date.slice(0, 4))
  ) {
    return 'birthdayInvalid';
  }
  if (Number(date.slice(5, 7)) !== month || Number(date.slice(8)) !== day) {
    return 'notBirthday';
  }
  if (previous?.status === 'confirmed' && previous.cycle === cycle) {
    return 'cooldown';
  }
  return greetDecision({
    state,
    settings: { ...settings, staleDays: 1, cooldownDays: 1 },
    previous,
    now,
  });
};
const pick = (values, previous) => {
  const unique = [...new Set(values)];
  const candidates =
    unique.length > 1 ? unique.filter((v) => v !== previous) : unique;
  return candidates[Math.floor(Math.random() * candidates.length)];
};
const stepsFor = (_kind, settings, previous) => {
  const sticker = pick(
    birthdayStickers(settings.stickers),
    previous?.steps?.[0]?.sticker
  );
  const text =
    pick(questionVariants(settings.messages), previous?.steps?.at(-1)?.text) ??
    '';
  const attachments = birthdayAttachments(settings.attachments);
  return [
    ...(sticker ? [{ text: '', sticker }] : []),
    ...(text || attachments.length
      ? [{ text, ...(attachments.length ? { attachments } : {}) }]
      : []),
  ].map((step) => ({ ...step, randomId: vkMessageRandomId() }));
};
const policy = {
  ...vkBirthdaySettings,
  snapshotMethod: 'birthdaySnapshot',
  stateMethod: 'birthdayState',
  effectMethod: 'reengageEffect',
  cycle: (settings, now) => birthdayDate(now, settings.timeZone),
  stepsFor,
  decision: birthdayDecision,
};
export const createVkBirthdayJob = (options) =>
  createVkSequenceJob({ ...options, kind: 'birthday', policy });
