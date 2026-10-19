import { describe, it, expect } from 'test-anywhere';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { discoverServer } from '../src/web/discover.js';

const ok = () => ({ ok: true, json: async () => ({ links: 0 }) });
const fail = () => ({ ok: false, json: async () => ({}) });

describe('mobile and Electron packaging', () => {
  it('uses WebView-provided LAN candidates in server discovery', async () => {
    const previous = globalThis.metaSovereignShell;
    globalThis.metaSovereignShell = {
      discoveryCandidates: ['http://192.168.1.20:8787'],
    };
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      return url === 'http://192.168.1.20:8787/api/status' ? ok() : fail();
    };
    try {
      const out = await discoverServer({
        fetchImpl,
        storage: null,
        origin: 'capacitor://localhost',
        candidates: [],
      });
      expect(out).toEqual({ origin: 'http://192.168.1.20:8787' });
      expect(calls[0]).toBe('http://192.168.1.20:8787/api/status');
    } finally {
      globalThis.metaSovereignShell = previous;
    }
  });

  it('wires Electron auto-updates through electron-updater', async () => {
    const { configureAutoUpdates } = await import('../electron/main.js');
    const events = [];
    let checked = false;
    let feed = null;
    const result = configureAutoUpdates({
      app: { isPackaged: true },
      feedUrl: 'https://updates.example.test/meta-sovereign',
      logger: { info() {}, error() {} },
      autoUpdater: {
        on: (event) => events.push(event),
        setFeedURL: (next) => {
          feed = next;
        },
        checkForUpdatesAndNotify: () => {
          checked = true;
          return Promise.resolve(null);
        },
      },
    });
    expect(result).toEqual({ enabled: true, reason: 'checking' });
    expect(feed).toEqual({
      provider: 'generic',
      url: 'https://updates.example.test/meta-sovereign',
    });
    expect(events.includes('update-downloaded')).toBe(true);
    expect(checked).toBe(true);
  });

  it('skips auto-updates on Windows arm64, whose latest.yml is shared with x64 (issue #37)', async () => {
    const { configureAutoUpdates } = await import('../electron/main.js');
    let checked = false;
    const result = configureAutoUpdates({
      app: { isPackaged: true },
      feedUrl: '',
      platform: 'win32',
      arch: 'arm64',
      logger: { info() {}, error() {} },
      autoUpdater: {
        checkForUpdatesAndNotify: () => {
          checked = true;
          return Promise.resolve(null);
        },
      },
    });
    expect(result).toEqual({ enabled: false, reason: 'unsupported-arch' });
    expect(checked).toBe(false);
  });

  it('finds the CommonJS autoUpdater getter behind the ESM default export (issue #37)', async () => {
    const { pickAutoUpdater } = await import('../electron/main.js');
    const updater = { checkForUpdatesAndNotify() {} };
    // Shape of `await import('electron-updater')`: no named export, the
    // updater is a lazy getter on module.exports.
    const cjs = {};
    Object.defineProperty(cjs, 'autoUpdater', { get: () => updater });
    expect(pickAutoUpdater({ default: cjs })).toBe(updater);
    expect(pickAutoUpdater({ autoUpdater: updater })).toBe(updater);
    expect(pickAutoUpdater({})).toBe(null);
  });

  it('keeps the packaged desktop store in userData, not the cwd (issue #37)', async () => {
    const { resolveDesktopStoreDir } = await import('../electron/main.js');
    const app = { getPath: (name) => `/home/u/.config/Meta Sovereign/${name}` };
    expect(resolveDesktopStoreDir({ app, env: {} })).toBe(
      path.join('/home/u/.config/Meta Sovereign/userData', 'store')
    );
    expect(
      resolveDesktopStoreDir({ app, env: { META_SOVEREIGN_STORE_DIR: '/x' } })
    ).toBe('/x');
  });

  it('starts the desktop shell from package.json#main in packaged apps (issue #37)', async () => {
    const src = await fs.readFile('js/electron/main.js', 'utf8');
    // Packaged Electron apps have no script path in process.argv, so an
    // argv-based "is main module" guard would never start the window.
    expect(src.includes('process.argv[1]')).toBe(false);
    expect(src).toContain("process.type === 'browser'");
  });

  it('ships a Capacitor mobile build surface for iOS and Android', async () => {
    const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
    expect(pkg.scripts['build:mobile']).toBe(
      'npm run build:web && node js/scripts/build-mobile.mjs'
    );
    expect(pkg.scripts.electron).toContain(
      'npm exec --yes --package electron@^44.9.0'
    );
    expect(pkg.scripts['mobile:sync']).toBe(
      'npm run build:mobile && node js/scripts/mobile-platform.mjs sync'
    );
    expect(Boolean(pkg.scripts['mobile:ios'])).toBe(true);
    expect(Boolean(pkg.scripts['mobile:android'])).toBe(true);
    expect(pkg.peerDependencies['@capacitor/cli']).toBe('^8.5.3');

    const cap = JSON.parse(await fs.readFile('capacitor.config.json', 'utf8'));
    expect(cap.appId).toBe('foundation.link.meta.sovereign');
    expect(cap.webDir).toBe('mobile/www');
  });
});
