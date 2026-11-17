/** Isolate real rolling workers from provider sessions and scheduled work. */
export const rollingWorkerOptions = {
  tls: false,
  telegramAccount: false,
  enableSync: false,
  enableHandlers: false,
  automations: { scheduler: false },
  emailPoll: false,
  backups: { intervalHours: 0 },
};
