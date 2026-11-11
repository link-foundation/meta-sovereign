import { createServer } from 'node:http';
import { build } from 'esbuild';

/** Isolated production React hook fixture; no owner app or account. */
export const openLayoutFixture = async () => {
  const bundle = await build({
    entryPoints: ['experiments/issue-56/layout-observer-fixture.js'],
    bundle: true,
    write: false,
    format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Layout observer ordering</title>
    <style>body{font:18px system-ui;background:#eceff3;padding:24px;color:#20252b}
    .chat-main{position:relative;height:500px;max-width:680px;background:white;border:1px solid #ccd3dc}
    .chat-scroll{height:100%;overflow:auto;box-sizing:border-box;padding:16px 24px 80px;overflow-anchor:none}
    .bubble-row{padding:18px;background:#e4f3e6;border-radius:12px}
    .chat-composer{position:absolute;bottom:12px;left:12px;right:12px;height:60px;background:#d9e1ef;display:grid;place-items:center}
    #status[data-level=warn]{color:#a41616}#status{font-weight:600}</style>
    <h1>Layout diagnostic · isolated fixture</h1><p>A late 38px row settles through ResizeObserver.</p>
    <div id="root"></div><p id="status">Waiting for geometry</p><script src="/fixture.js"></script></html>`;
  const server = createServer((req, res) => {
    res.setHeader(
      'content-type',
      req.url === '/fixture.js' ? 'text/javascript' : 'text/html'
    );
    res.end(req.url === '/fixture.js' ? bundle.outputFiles[0].text : html);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      ),
  };
};

if (process.argv.includes('--serve')) {
  const fixture = await openLayoutFixture();
  console.log(fixture.base);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      void fixture.close();
    });
  }
}
