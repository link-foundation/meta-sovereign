/** Await asynchronous browser reads until a truthy value, with a finite deadline. */
export const waitForBrowserValue = async (
  page,
  read,
  argument,
  { timeoutMs = 20000, pollingMs = 250 } = {}
) => {
  const deadline = Date.now() + timeoutMs;
  do {
    const value = await page.evaluate(read, argument);
    if (value) {
      return value;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      break;
    }
    await page.waitForTimeout(Math.min(pollingMs, remaining));
  } while (Date.now() < deadline);
  throw new Error('timed out waiting for asynchronous browser value');
};
