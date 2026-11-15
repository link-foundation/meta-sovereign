import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatIndented } from 'lino-objects-codec';
import { desktopConfiguration } from '../electron/configuration.js';
import { startDesktop, createMainWindow } from '../electron/main.js';
import { attachLocalCertificate } from '../electron/local-certificate.js';
import { makeLocalCertificate } from '../src/server/local-tls.js';
import { certificateFingerprint } from '../src/server/local-key.js';

const fixture = async (run) => {
  const cwd = await mkdtemp(join(tmpdir(), 'desktop-configuration-'));
  const globalDir = join(cwd, 'user');
  const localDir = join(cwd, 'local');
  await mkdir(globalDir);
  await mkdir(localDir);
  const put = (scope, server) =>
    writeFile(
      join(scope === 'global' ? globalDir : localDir, 'config.lino'),
      formatIndented({ id: 'configuration', obj: { server } })
    );
  try {
    await run({ cwd, globalDir, localDir, put });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
};
const shell = () => {
  const app = new EventEmitter();
  app.getPath = () => '/unused-desktop-fixture';
  app.whenReady = async () => {};
  const calls = { windows: [], closed: 0, options: null };
  class Window extends EventEmitter {
    static getAllWindows() {
      return calls.windows;
    }
    constructor() {
      super();
      calls.windows.push(this);
      this.webContents = { isDestroyed: () => false };
    }
    show() {}
    async loadURL(url) {
      calls.url = url;
    }
    destroy() {
      this.emit('closed');
    }
  }
  return {
    app,
    Window,
    calls,
    electronLoader: async () => ({ app, BrowserWindow: Window }),
    updaterLoader: async () => null,
    serverLoader: async () => ({
      startServer: async (options) => {
        calls.options = options;
        return { port: 4321, close: async () => calls.closed++ };
      },
    }),
  };
};

test(
  'desktop layers the same readable files and explicit options with shell defaults',
  { timeout: 5000 },
  async () =>
    fixture(async (f) => {
      const empty = await desktopConfiguration([], f);
      assert.equal(empty.port, 0);
      assert.equal(empty.localUi, true);
      assert.equal(empty.tls, false);
      await f.put('global', { port: 8787, verbose: true, backupKeep: 5 });
      await f.put('local', {
        verbose: false,
        backupIntervalHours: 0.5,
        recoveryFormats: 'text,binary',
        jsonCompatibility: false,
      });
      const argv = ['--port=9001', '--store=private-fixture-store'];
      const result = await desktopConfiguration(argv, f);
      assert.deepEqual(result, {
        port: 9001,
        localUi: true,
        tls: false,
        verbose: false,
        backups: { intervalHours: 0.5, keep: 5, formats: ['text', 'binary'] },
        jsonCompatibility: false,
        storeDir: 'private-fixture-store',
      });
      assert.deepEqual(argv, ['--port=9001', '--store=private-fixture-store']);
    })
);

test(
  'desktop retains explicit hosted UI, TLS, origins and selected-file values',
  { timeout: 5000 },
  async () =>
    fixture(async (f) => {
      await f.put('local', {
        localUi: false,
        tls: true,
        allowOrigin: 'https://example.invalid',
        uiUrl: 'https://example.invalid/app/',
        jsonCompatibility: true,
      });
      const result = await desktopConfiguration(
        ['--app-config=local/config.lino', '--json-compatibility=false'],
        f
      );
      assert.equal(result.localUi, false);
      assert.equal(result.port, 8787);
      assert.equal(result.tls, process.env.MS_TLS !== 'off');
      assert.equal(result.allowOrigins, 'https://example.invalid');
      assert.equal(result.uiUrl, 'https://example.invalid/app/');
      assert.equal(result.jsonCompatibility, false);
    })
);

test(
  'actual desktop startup passes layered values before opening its runtime',
  { timeout: 5000 },
  async () =>
    fixture(async (f) => {
      await f.put('global', { port: 8787, verbose: true, backupKeep: 5 });
      await f.put('local', { verbose: false, backupKeep: 0 });
      const s = shell();
      const lifecycle = await startDesktop({
        ...s,
        argv: ['--port=9001'],
        configuration: f,
      });
      try {
        assert.equal(s.calls.options.port, 9001);
        assert.equal(s.calls.options.verbose, false);
        assert.equal(s.calls.options.backups.keep, 0);
        assert.equal(s.calls.options.localUi, true);
        assert.equal(s.calls.options.tls, false);
        assert.equal(s.calls.url, 'http://127.0.0.1:4321/');
      } finally {
        await lifecycle.close();
        lifecycle.dispose();
      }
      assert.equal(s.calls.closed, 1);
    })
);

test(
  'malformed or explicitly missing desktop configuration refuses before server import',
  { timeout: 5000 },
  async () =>
    fixture(async (f) => {
      await writeFile(
        join(f.globalDir, 'config.lino'),
        'private malformed configuration'
      );
      const s = shell();
      let imports = 0;
      const options = {
        ...s,
        argv: [],
        configuration: f,
        serverLoader: async () => {
          imports++;
          throw new Error('unexpected server import');
        },
      };
      await assert.rejects(startDesktop(options), {
        code: 'INVALID_APP_CONFIGURATION',
      });
      assert.equal(imports, 0);
      await rm(join(f.globalDir, 'config.lino'));
      await assert.rejects(
        startDesktop({ ...options, argv: ['--app-config=missing.lino'] }),
        { code: 'INVALID_APP_CONFIGURATION' }
      );
      assert.equal(imports, 0);
    })
);

test(
  'certificate exception requires the owned contents, exact origin and actual certificate',
  { timeout: 5000 },
  () => {
    const app = new EventEmitter();
    let destroyed = false;
    const contents = { isDestroyed: () => destroyed };
    const cert = makeLocalCertificate().cert;
    const other = makeLocalCertificate().cert;
    const origin = 'https://127.0.0.1:4321';
    const dispose = attachLocalCertificate({
      app,
      contents,
      origin,
      fingerprint: certificateFingerprint(cert),
    });
    const check = (sender, url, data) => {
      let accepted = false;
      let prevented = false;
      app.emit(
        'certificate-error',
        {
          preventDefault: () => {
            prevented = true;
          },
        },
        sender,
        url,
        'ERR_CERT_AUTHORITY_INVALID',
        { data },
        (value) => {
          accepted = value;
        }
      );
      return { accepted, prevented };
    };
    assert.deepEqual(check(contents, `${origin}/`, cert), {
      accepted: true,
      prevented: true,
    });
    for (const [sender, url, data] of [
      [{}, `${origin}/`, cert],
      [contents, 'https://127.0.0.1:4322/', cert],
      [contents, 'https://example.invalid/', cert],
      [contents, `${origin}/`, other],
      [contents, 'invalid', cert],
      [contents, `${origin}/`, 'invalid'],
    ]) {
      assert.deepEqual(check(sender, url, data), {
        accepted: false,
        prevented: false,
      });
    }
    destroyed = true;
    assert.equal(check(contents, `${origin}/`, cert).accepted, false);
    dispose();
    dispose();
    assert.equal(app.listenerCount('certificate-error'), 0);
    assert.throws(
      () => attachLocalCertificate({ app, contents, origin }),
      /fingerprint/
    );
  }
);

test(
  'TLS desktop window uses the secure owned origin and releases its exception',
  { timeout: 5000 },
  async () => {
    const s = shell();
    const win = await createMainWindow({
      app: s.app,
      BrowserWindow: s.Window,
      port: 4321,
      tls: { fingerprint: 'fixture' },
    });
    assert.equal(s.calls.url, 'https://127.0.0.1:4321/');
    assert.equal(s.app.listenerCount('certificate-error'), 1);
    win.destroy();
    assert.equal(s.app.listenerCount('certificate-error'), 0);
    class Broken extends s.Window {
      async loadURL() {
        throw new Error('synthetic load refusal');
      }
    }
    await assert.rejects(
      createMainWindow({
        app: s.app,
        BrowserWindow: Broken,
        port: 4321,
        tls: { fingerprint: 'fixture' },
      }),
      /synthetic load refusal/
    );
    assert.equal(s.app.listenerCount('certificate-error'), 0);
  }
);
