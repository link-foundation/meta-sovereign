import { encodeWire } from '../transport/lino.js';

/** POSIX worker controls also interrupt an active exact-answer review delay. */
export const applicationModeSignals = (
  service,
  input,
  log,
  events = process
) => {
  if (events.platform === 'win32') {
    return () => {};
  }
  const mode = (noQuestionnaires) => () => {
    try {
      log(
        encodeWire(
          service['application-signal-mode']({ ...input, noQuestionnaires })
        )
      );
    } catch (error) {
      log(
        encodeWire({
          ok: false,
          code: error.code ?? 'jobs-application-command',
        })
      );
    }
  };
  const defer = mode(true);
  const review = mode(false);
  events.on('SIGUSR1', defer);
  events.on('SIGUSR2', review);
  return () => {
    events.off('SIGUSR1', defer);
    events.off('SIGUSR2', review);
  };
};
