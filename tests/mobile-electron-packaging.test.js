import { describe, it, expect } from 'test-anywhere';
import { promises as fs } from 'node:fs';
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

  it('ships a Capacitor mobile build surface for iOS and Android', async () => {
    const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
    expect(pkg.scripts['build:mobile']).toBe(
      'npm run build:web && node scripts/build-mobile.mjs'
    );
    expect(pkg.scripts.electron).toContain(
      'npm exec --yes --package electron@^41.5.0'
    );
    expect(pkg.scripts['mobile:sync']).toBe(
      'npm run build:mobile && node scripts/mobile-platform.mjs sync'
    );
    expect(Boolean(pkg.scripts['mobile:ios'])).toBe(true);
    expect(Boolean(pkg.scripts['mobile:android'])).toBe(true);
    expect(pkg.peerDependencies['@capacitor/cli']).toBe('^7.6.2');

    const cap = JSON.parse(await fs.readFile('capacitor.config.json', 'utf8'));
    expect(cap.appId).toBe('foundation.link.meta.sovereign');
    expect(cap.webDir).toBe('mobile/www');
  });
});
