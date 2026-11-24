import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

/** One owned browser case, never a local browser matrix. */
export const reviewVkNative = async (verify, screenshots) => {
  await mkdir(screenshots, { recursive: true });
  const browser = await { chromium, webkit }[
    process.env.E2E_BROWSER ?? 'webkit'
  ].launch({ headless: true });
  try {
    console.log(
      JSON.stringify(
        await verify(browser, {
          before: process.argv.includes('--before'),
          screenshots,
        })
      )
    );
  } finally {
    await browser.close();
  }
};
