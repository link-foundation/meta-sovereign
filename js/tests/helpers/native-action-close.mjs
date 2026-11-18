/** Observe both promises immediately and drain activation before reporting failure. */
export const activateAndWaitForClose = async (owned, activate) => {
  const [closed, action] = await Promise.allSettled([
    owned.waitForEvent('close'),
    Promise.resolve().then(activate),
  ]);
  for (const result of [action, closed]) {
    if (result.status === 'rejected') {
      throw result.reason;
    }
  }
};
