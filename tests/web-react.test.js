import { describe, it, expect } from 'test-anywhere';
import { promises as fs } from 'node:fs';

const readText = (path) => fs.readFile(path, 'utf8');

describe('React SPA packaging', () => {
  it('ships a bundled React entrypoint while keeping source editable', async () => {
    const pkg = JSON.parse(await readText('package.json'));
    const devDeps = pkg.devDependencies ?? {};
    expect(Boolean(devDeps.react)).toBe(true);
    expect(Boolean(devDeps['react-dom'])).toBe(true);
    expect(Boolean(devDeps.esbuild)).toBe(true);
    expect(pkg.scripts['build:web']).toBe('node scripts/build-web.mjs');

    const html = await readText('src/web/index.html');
    expect(html.includes('id="app"')).toBe(true);
    expect(html.includes('src="./app.min.js"')).toBe(true);

    const app = await readText('src/web/app.js');
    expect(app.includes("from 'react'")).toBe(true);
    expect(app.includes("from 'react-dom/client'")).toBe(true);

    const bundle = await readText('src/web/app.min.js');
    expect(bundle.length > 0).toBe(true);
  });
});
