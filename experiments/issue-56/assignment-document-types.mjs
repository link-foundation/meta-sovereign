import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { readAssignmentSourceDocument } from '../../js/src/assignments/source-document.js';

const instructions = 'Publish the test project with a working check.';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.E2E_EXECUTABLE_PATH,
});
let server;
try {
  const page = await browser.newPage();
  await page.setContent(
    `<main><h1>Assignment</h1><p>${instructions}</p></main>`
  );
  const files = {
    '/plain': ['text/plain; charset=utf-8', instructions],
    '/markdown': [
      'text/markdown; charset=utf-8',
      `# Assignment\n\n${instructions}`,
    ],
    '/pdf': ['application/pdf', await page.pdf()],
  };
  server = createServer(({ url }, response) => {
    const file = files[url];
    if (file) {
      response.setHeader('content-type', file[0]);
      response.end(file[1]);
    } else {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const path of Object.keys(files)) {
    const downloads = [];
    const download = (item) => downloads.push(item.cancel());
    page.on('download', download);
    let navigation;
    try {
      const response = await page.goto(base + path, {
        waitUntil: 'domcontentloaded',
        timeout: 5000,
      });
      navigation = {
        status: response?.status(),
        contentType: await page.evaluate(() => document.contentType),
        receipt: await page.evaluate(readAssignmentSourceDocument),
      };
    } catch (error) {
      navigation = { error: error.message.split('\n')[0] };
    } finally {
      page.off('download', download);
      await Promise.all(downloads);
    }
    console.log(
      JSON.stringify({ path, downloads: downloads.length, ...navigation })
    );
  }
} finally {
  await browser.close();
  if (server?.listening) {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
}
