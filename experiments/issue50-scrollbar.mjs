// Reproduce the selection fixture's native-scrollbar click, without the app.
import assert from 'node:assert/strict';
import { webkit } from 'playwright';

const browser = await webkit.launch();
try {
  const page = await browser.newPage();
  await page.setContent(`
    <style>
      #scroll { width: 300px; height: 150px; overflow-y: scroll; }
      #scroll::-webkit-scrollbar { width: 32px; }
      #scroll::-webkit-scrollbar-thumb { background: #555; }
      #scroll > div { height: 800px; background: #def; }
    </style>
    <div id="scroll"><div>Message column with blank space beside it</div></div>
  `);
  await page.evaluate(() => {
    globalThis.clicks = 0;
    document.querySelector('#scroll').addEventListener('click', () => {
      globalThis.clicks += 1;
    });
  });
  const geometry = await page.locator('#scroll').evaluate((node) => ({
    x: node.getBoundingClientRect().left,
    y: node.getBoundingClientRect().top,
    width: node.getBoundingClientRect().width,
    clientWidth: node.clientWidth,
    clientLeft: node.clientLeft,
  }));
  assert(geometry.width - geometry.clientWidth > 12);
  await page.mouse.click(geometry.x + geometry.width - 12, geometry.y + 30);
  assert.equal(await page.evaluate(() => globalThis.clicks), 0);
  await page.mouse.click(
    geometry.x + geometry.clientLeft + geometry.clientWidth - 12,
    geometry.y + 30
  );
  assert.equal(await page.evaluate(() => globalThis.clicks), 1);
  console.log(
    'PASS: border-box click hits scrollbar; client-width click reaches content',
    geometry
  );
} finally {
  await browser.close();
}
