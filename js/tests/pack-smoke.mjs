// The package as npm would ship it, without publishing it: `npm pack`
// builds the very tarball `npm publish` uploads, and `npx --package`
// runs it the way `npx -y meta-sovereign serve` will once it is on the
// registry. The server must default to the hosted app, answer that
// origin (CORS) and Safari (its picture), on a free port and store.
//
//   npm run test:pack

import { spawn, spawnSync } from 'node:child_process';
import { promises as fs, appendFileSync } from 'node:fs';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { waitForServer } from './helpers/pack-process.mjs';
import { debug } from '../scripts/debug-print.mjs';
import { HOSTED_UI_URL } from '../src/server/hosted-ui.js';
import { localTlsPaths } from '../src/server/local-tls.js';
import { BEACON_PATH, BEACON_WIDTH, pictureSays } from '../src/web/discover.js';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const say = (msg) => console.log(`[pack-smoke] ${msg}`);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

// npx starts the server as its own child: stop them all.
const stop = (child) => {
  if (!child?.pid || child.exitCode !== null) {
    return;
  }
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch (error) {
      if (error.code !== 'ESRCH') {
        throw error;
      }
    }
  }
};

const freePort = () =>
  new Promise((resolve) => {
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

const pack = (dir) => {
  const packed = spawnSync(npm, ['pack', '--json', '--pack-destination', dir], {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (packed.status !== 0) {
    throw new Error(`npm pack failed: ${packed.stderr}`);
  }
  const [{ filename, size, entryCount, files }] = JSON.parse(packed.stdout);
  for (const required of [
    'js/src/server/local-key-enclave.swift',
    'js/src/sources/system-contacts.swift',
    'js/src/sources/system-contacts.plist',
  ]) {
    if (!files.some((file) => file.path === required)) {
      throw new Error(`the package is missing ${required}`);
    }
  }
  say(`packed ${filename}: ${entryCount} files, ${size} bytes`);
  return path.join(dir, filename);
};

// The status over https, trusting only the server's own certificate.
const secureResponse = (base, ca, pathname) =>
  new Promise((resolve) => {
    https
      .get(`${base.replace(/^http:/, 'https:')}${pathname}`, { ca }, (res) => {
        res.resume();
        resolve(res.statusCode);
      })
      .on('error', () => resolve(null));
  });

// What is wrong with the running server, if anything.
const problemsOf = async (base, storeDir) => {
  const problems = [];
  const status = await fetch(`${base}/api/status`, {
    headers: { origin: new URL(HOSTED_UI_URL).origin },
  });
  if (typeof (await status.json()).links !== 'number') {
    problems.push('/api/status has no link count');
  }
  if (
    status.headers.get('access-control-allow-origin') !==
    new URL(HOSTED_UI_URL).origin
  ) {
    problems.push('the hosted app may not use the server');
  }
  const picture = await (await fetch(`${base}${BEACON_PATH}`)).text();
  const [width, height] = (picture.match(/width="(\d+)" height="(\d+)"/) ?? [])
    .slice(1)
    .map(Number);
  if (width !== BEACON_WIDTH) {
    problems.push('Safari cannot find the server by its picture');
  } else if (!pictureSays(height).tls) {
    problems.push('the picture does not say https is on');
  }
  // Safari reaches the server over https once it trusts it (R-Y64).
  const ca = await fs
    .readFile(localTlsPaths(storeDir).cert, 'utf8')
    .catch(() => null);
  if (!ca || (await secureResponse(base, ca, '/api/status')) !== 200) {
    problems.push('the server does not answer https with its certificate');
  }
  const page = await fetch(`${base}/`, { redirect: 'manual' });
  if (page.status !== 302 || page.headers.get('location') !== HOSTED_UI_URL) {
    problems.push('the default app is not GitHub Pages');
  }
  if (ca && (await secureResponse(base, ca, '/app.min.js')) !== 404) {
    problems.push('the localhost UI is enabled without opting in');
  }
  return problems;
};

const main = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-pack-'));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  let child = null;
  let log = '';
  const artifactDir = path.resolve(
    process.env.PACK_SMOKE_ARTIFACT_DIR || 'artifacts/pack'
  );
  const record = (chunk) => {
    log = (log + chunk).slice(-1024 * 1024);
    appendFileSync(path.join(artifactDir, 'pack-smoke.log'), chunk);
    debug(String(chunk).trim());
  };
  const cache = path.join(dir, 'cache');
  const environment = {
    ...process.env,
    npm_config_cache: cache,
    npm_config_logs_dir: path.join(artifactDir, 'npm'),
    npm_config_loglevel:
      process.env.CI_SCRIPTS_DEBUG === '1' ? 'verbose' : 'notice',
  };
  await fs.mkdir(artifactDir, { recursive: true });
  try {
    const tarball = pack(dir);
    await fs.mkdir(path.join(dir, 'run'));
    // npx resolves optional dependencies from the registry before starting the
    // CLI. Complete that phase explicitly; the startup deadline starts after it.
    say('installing the packed package into an isolated npm exec cache');
    const installStarted = Date.now();
    await new Promise((resolve, reject) => {
      child = spawn(
        npm,
        [
          'exec',
          '--yes',
          `--package=${tarball}`,
          '--',
          'node',
          '-e',
          'console.log("packed dependencies installed")',
        ],
        {
          cwd: path.join(dir, 'run'),
          env: environment,
          shell: process.platform === 'win32',
          detached: process.platform !== 'win32',
        }
      );
      child.stdout.on('data', record);
      child.stderr.on('data', record);
      child.once('error', reject);
      child.once('close', (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`packed package install exited with ${code}`))
      );
    });
    say(
      `packed dependencies installed in ${Date.now() - installStarted}ms; starting the CLI`
    );
    child = spawn(
      npx,
      [
        '-y',
        `--package=${tarball}`,
        'meta-sovereign',
        'serve',
        '--trust=false',
        '--open=false',
        '--hardware-key=false',
        `--port=${port}`,
        `--store=${path.join(dir, 'store')}`,
      ],
      {
        cwd: path.join(dir, 'run'),
        // Its own npm cache: nothing of this run is left behind.
        env: environment,
        shell: process.platform === 'win32',
        detached: process.platform !== 'win32',
      }
    );
    child.stdout.on('data', record);
    child.stderr.on('data', record);
    let spawnError;
    child.once('error', (error) => {
      spawnError = error;
    });
    await waitForServer(`${base}/api/status`, child, {
      headers: { origin: new URL(HOSTED_UI_URL).origin },
    });
    if (spawnError) {
      throw spawnError;
    }
    say(`npx started the packed server on ${base}`);
    const problems = await problemsOf(base, path.join(dir, 'store'));
    if (!log.includes(`open the app → ${HOSTED_UI_URL}`)) {
      problems.push('serve does not print the hosted app address');
    }
    if (problems.length > 0) {
      for (const problem of problems) {
        console.error(`[pack-smoke] FAIL: ${problem}`);
      }
      process.exitCode = 1;
      return;
    }
    say(
      'PASS: the packed server defaults to GitHub Pages with a local HTTPS API'
    );
  } catch (error) {
    console.error(`[pack-smoke] FAIL: ${error.message}\n${log}`);
    process.exitCode = 1;
  } finally {
    stop(child);
    await sleep(1000);
    await fs.appendFile(
      path.join(artifactDir, 'pack-smoke.log'),
      '\nPacked smoke process finished.\n'
    );

    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
};

await main();
