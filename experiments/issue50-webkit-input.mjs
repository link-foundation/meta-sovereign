// Bounded, app-free diagnostic: does a native click survive a wide resize?
import { pathToFileURL } from 'node:url';

export const probeInput = async (browser) => {
  const page = await browser.newPage({
    viewport: { width: 1100, height: 800 },
  });
  try {
    await page.setContent(
      '<style>body{margin:0;color-scheme:dark}*{scrollbar-color:#555 transparent}::-webkit-scrollbar{width:8px}::-webkit-scrollbar-thumb{background:#555}#scroll{position:fixed;inset:116px 0 0 552px;overflow:auto}#column{width:736px;height:1800px;margin:auto;background:#ddd}</style><div id="scroll"><div id="column">Messages</div></div>'
    );
    await page.evaluate(() => {
      globalThis.inputs = [];
      for (const type of ['mousedown', 'mouseup', 'click']) {
        globalThis.addEventListener(
          type,
          (event) =>
            globalThis.inputs.push({
              type,
              x: event.clientX,
              y: event.clientY,
            }),
          true
        );
      }
    });
    await page.setViewportSize({ width: 2200, height: 1000 });
    await page.locator('#scroll').evaluate((node) => {
      node.scrollTop = 200;
    });
    for (const x of [1800, 2188, 1800, 2188]) {
      await page.mouse.click(x, 246);
    }
    console.log(
      '[input-probe]',
      JSON.stringify(
        await page.evaluate(() => ({
          inputs: globalThis.inputs,
          screen: [
            globalThis.screen.width,
            globalThis.screen.height,
            globalThis.screen.availWidth,
            globalThis.screen.availHeight,
          ],
          window: [
            globalThis.innerWidth,
            globalThis.innerHeight,
            globalThis.outerWidth,
            globalThis.outerHeight,
          ],
        }))
      )
    );
  } finally {
    await page.close();
  }
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { webkit } = await import('playwright');
  const browser = await webkit.launch();
  try {
    await probeInput(browser);
  } finally {
    await browser.close();
  }
}
