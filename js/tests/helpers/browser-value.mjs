import assert from 'node:assert/strict';

// Page.waitForFunction tests a returned Promise's truthiness before its value.
// Explicitly await async storage reads so a false result really polls again.
export const waitForBrowserValue = async (
  page,
  read,
  argument,
  timeout = 5000
) => {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await page.evaluate(read, argument);
    if (value) {
      return value;
    }
    assert.ok(Date.now() < deadline, 'browser value did not become truthy');
    await new Promise((resolve) => globalThis.setTimeout(resolve, 25));
  }
};
