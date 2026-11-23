import { createInterface } from 'node:readline';
import { chromium } from 'playwright';
import {
  addApplicationVerification,
  clearApplicationVerification,
  openApplicationVerification,
} from './application-verification-fixture.mjs';

const terminal = createInterface({ input: process.stdin });
let browser;
let review;
let closing;
const showVerification = async () => {
  await review.owner.evaluate(addApplicationVerification, false);
  const held = await review.action('read', review.receipt, {
    browserSlot: 'interview',
  });
  review.receipt = held;
  console.log(JSON.stringify({ verification: held.state }));
};
const close = () =>
  (closing ??= (async () => {
    terminal.close();
    try {
      if (review) {
        const privateState = await review.owner.evaluate(() => ({
          challengeReads: globalThis.challengeReads,
          submits: globalThis.applicationAttempts,
        }));
        await review.fixture.close();
        const [{ focuses, closed }] = review.fixture.records;
        console.log(JSON.stringify({ ...privateState, focuses, closed }));
      }
    } finally {
      await browser?.close();
    }
  })());
process.once('SIGINT', close);
process.once('SIGTERM', close);

try {
  browser = await chromium.launch({
    executablePath: process.env.E2E_EXECUTABLE_PATH ?? '/usr/bin/google-chrome',
    headless: true,
    handleSIGINT: false,
    handleSIGTERM: false,
    args: ['--disable-dev-shm-usage'],
  });
  review = await openApplicationVerification(browser);
  if (process.env.HH_MCP_DEFER_VERIFICATION !== '1') {
    await showVerification();
  }
  console.log(JSON.stringify({ base: review.fixture.base }));
  for await (const line of terminal) {
    const command = line.trim();
    if (command === 'quit') {
      break;
    }
    if (command === 'release') {
      await review.owner.evaluate(clearApplicationVerification);
      console.log(JSON.stringify({ released: true }));
    }
    if (command === 'verify') {
      await showVerification();
    }
  }
} finally {
  await close();
}
