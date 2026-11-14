import { pendingPrefill, challengeDelay } from '../forms/challenge-wait.js';

export const awaitFormPrefill = async (
  reader,
  initial,
  progress,
  cancelled
) => {
  let result = initial;
  let state;
  while (pendingPrefill(result) && !cancelled()) {
    if (result.state !== state) {
      progress(result);
      state = result.state;
    }
    await challengeDelay(1000);
    if (cancelled()) {
      break;
    }
    result = await reader.prefillStatus({
      id: result.reviewSession.id,
      requestId: result.requestId,
    });
  }
  return result;
};
