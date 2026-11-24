import { browserName } from '../browser/policy.js';
import { browserUnreadId } from '../automation/question-unread-identity.js';
import { validUnreadSkipReceipt } from '../automation/question-unread-polling-state.js';
import { jobsFailure } from './options.js';

const fail = () => {
  throw jobsFailure(
    'application-chats-input',
    'Enable chat review before watching already-read chats. Choose separate application and chat slots and a 1–120 minute interval.'
  );
};

/** Absence preserves the signatures of already acknowledged application batches. */
export const applicationChatSettings = (input, browserSlot) => {
  const names = [
    'processChats',
    'chatsIntervalMinutes',
    'chatBrowserSlot',
    'chatModelDraft',
    'chatPrefillForms',
    'chatWatchWaiting',
  ];
  if (names.every((name) => input[name] === undefined)) {
    return {};
  }
  if (
    [
      'processChats',
      'chatModelDraft',
      'chatPrefillForms',
      'chatWatchWaiting',
    ].some(
      (name) => input[name] !== undefined && typeof input[name] !== 'boolean'
    ) ||
    (input.chatWatchWaiting && input.processChats !== true)
  ) {
    fail();
  }
  const interval =
    input.chatsIntervalMinutes ?? (input.chatWatchWaiting ? 1 : 120);
  const slot = browserName(input.chatBrowserSlot ?? 'chat-slot');
  if (
    !Number.isInteger(interval) ||
    interval < 1 ||
    interval > 120 ||
    slot === browserSlot
  ) {
    fail();
  }
  return {
    processChats: input.processChats === true,
    chatsIntervalMinutes: interval,
    chatBrowserSlot: slot,
    chatModelDraft: input.chatModelDraft === true,
    ...(input.chatPrefillForms === undefined
      ? {}
      : { chatPrefillForms: input.chatPrefillForms }),
    ...(input.chatWatchWaiting === undefined
      ? {}
      : { chatWatchWaiting: input.chatWatchWaiting }),
  };
};

export const applicationChatView = (record, runtime) => {
  if (!record.options.processChats) {
    return undefined;
  }
  const view = runtime?.chats?.status();
  if (view) {
    return !record.active && view.active
      ? {
          ...view,
          phase: 'draining',
          active: false,
          ...(view.skip ? { skip: null } : {}),
        }
      : view;
  }
  return (
    record.chatWorker ?? {
      phase: record.options.review.testMode
        ? 'preview'
        : runtime && record.active
          ? 'starting'
          : record.active
            ? 'interrupted'
            : 'stopped',
      active: Boolean(runtime && record.active),
      pid: null,
      passId: record.chatPassId,
      browserSlot: record.options.chatBrowserSlot,
      code: null,
      held: null,
    }
  );
};

const validApplicationSkip = (value, enabled) =>
  ([null, undefined].includes(value.skip) ||
    (enabled &&
      value.active &&
      value.skip.id === value.passId &&
      value.skip.chat === value.held?.chat &&
      validUnreadSkipReceipt(value.skip, value.passId))) &&
  (value.lastSkip === undefined ||
    (enabled && validUnreadSkipReceipt(value.lastSkip, value.passId)));

export const validApplicationChatView = (value, settings, active) => {
  if (!settings.processChats) {
    return value === undefined;
  }
  return (
    value &&
    [
      'starting',
      'running',
      'draining',
      'refused',
      'stopped',
      'interrupted',
      'preview',
    ].includes(value.phase) &&
    typeof value.active === 'boolean' &&
    (!value.active || active) &&
    value.active === ['starting', 'running'].includes(value.phase) &&
    (value.pid === null ||
      (Number.isSafeInteger(value.pid) && value.pid > 0)) &&
    browserUnreadId(value.passId) &&
    value.browserSlot === settings.chatBrowserSlot &&
    (value.code === null ||
      (typeof value.code === 'string' && value.code.length <= 120)) &&
    validApplicationSkip(value, settings.chatWatchWaiting) &&
    (value.held === null ||
      (typeof value.held.chat === 'string' &&
        value.held.chat.length <= 480 &&
        typeof value.held.title === 'string' &&
        value.held.title.length <= 1200 &&
        (value.held.url === null ||
          (typeof value.held.url === 'string' && validUrl(value.held.url)))))
  );
};

const validUrl = (value) => {
  try {
    const url = new URL(value);
    return (
      value.length <= 4096 &&
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
};
