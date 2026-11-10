// Finite synthetic WebKit probe: no app server, accounts or external sites.
import { webkit } from 'playwright';
import { makeBrowserCommander } from 'browser-commander';
import { startFormsFixture } from './forms-reader-fixture.mjs';
import { inspectFormSession } from '../../js/src/forms/inspection.js';

const fixture = await startFormsFixture();
let browser;
try {
  browser = await webkit.launch({ headless: true });
  const page = await browser.newPage();
  const commander = makeBrowserCommander({
    page,
    enableNetworkTracking: false,
    enableNavigationManager: false,
    enableDialogManager: false,
  });
  const evaluate = commander.evaluate.bind(commander);
  commander.evaluate = async (options) => {
    const value = await evaluate(options);
    console.log(
      JSON.stringify({
        target: 'commander',
        fn: options.fn.name,
        url: value.url,
        documentTime: value.documentTime,
        fields: value.fields?.length,
      })
    );
    return value;
  };
  page.on('frameattached', (frame) => {
    const read = frame.evaluate.bind(frame);
    frame.evaluate = async (fn, arg) => {
      const value = await read(fn, arg);
      console.log(
        JSON.stringify({
          target: 'frame',
          fn: fn.name,
          url: value?.url,
          documentTime: value?.documentTime,
          fields: value?.fields?.length,
        })
      );
      return value;
    };
  });
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const report = await inspectFormSession(
        { page, commander },
        { url: fixture.url }
      );
      console.log(
        JSON.stringify({
          attempt,
          fields: report.fields.length,
          frames: report.frames.length,
        })
      );
    } catch (error) {
      console.log(
        JSON.stringify({ attempt, code: error.code, message: error.message })
      );
    }
  }
  await commander.destroy();
} finally {
  await browser?.close();
  await fixture.close();
}
