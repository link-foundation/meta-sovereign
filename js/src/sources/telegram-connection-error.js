// Explicit transport refusals, shared by readers and the idempotent outbox.
export const isTelegramConnectionError = (error) =>
  /while disconnected|not connected|connection (?:was )?closed|network is closed/i.test(
    String(error?.message ?? error ?? '')
  );
