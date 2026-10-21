// The package as npm would ship it, without publishing it: `npm pack`
// builds the very tarball `npm publish` uploads, and `npx --package`
// runs it the way `npx -y meta-sovereign serve` will once it is on the
// registry. The server it starts must serve the app, answer the hosted
// app (CORS) and Safari (its picture), on a free port of its own and a
// store of its own.
//
//   npm run test:pack

import { spawn, spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { HOSTED_UI_URL } from '../src/server/hosted-ui.js';
import { BEACON_PATH, BEACON_WIDTH } from '../src/web/discover.js';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const say = (msg) => console.log(`[pack-smoke] ${msg}`);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

// npx starts the server as its own child: stop them all.
const stop = (child) => {
  if (!child || child.exitCode !== null) {
    return;
  }
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
  } else {
    process.kill(-child.pid, 'SIGTERM');
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
  const [{ filename, size, entryCount }] = JSON.parse(packed.stdout);
  say(`packed ${filename}: ${entryCount} files, ${size} bytes`);
  return path.join(dir, filename);
};

const waitFor = async (url, child) => {
  for (let i = 0; i < 600; i += 1) {
    if (child.exitCode !== null) {
      throw new Error(`the server exited with ${child.exitCode}`);
    }
    const answer = await fetch(url).catch(() => null);
    if (answer?.ok) {
      return;
    }
    await sleep(500);
  }
  throw new Error(`no answer from ${url}`);
};

// What is wrong with the running server, if anything.
const problemsOf = async (base) => {
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
  if (!picture.includes(`width="${BEACON_WIDTH}" height="1"`)) {
    problems.push('Safari cannot find the server by its picture');
  }
  const page = await fetch(`${base}/`);
  if (!page.ok || !(await page.text()).includes('app.min.js')) {
    problems.push('the local copy of the app is not served');
  }
  const bundle = await fetch(`${base}/app.min.js`);
  if (!bundle.ok) {
    problems.push(`app.min.js: ${bundle.status}`);
  }
  return problems;
};

const main = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-pack-'));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  let child = null;
  let log = '';
  try {
    const tarball = pack(dir);
    await fs.mkdir(path.join(dir, 'run'));
    child = spawn(
      npx,
      [
        '-y',
        `--package=${tarball}`,
        'meta-sovereign',
        'serve',
        `--port=${port}`,
        `--store=${path.join(dir, 'store')}`,
      ],
      {
        cwd: path.join(dir, 'run'),
        // Its own npm cache: nothing of this run is left behind.
        env: { ...process.env, npm_config_cache: path.join(dir, 'cache') },
        shell: process.platform === 'win32',
        detached: process.platform !== 'win32',
      }
    );
    child.stdout.on('data', (chunk) => (log += chunk));
    child.stderr.on('data', (chunk) => (log += chunk));
    await waitFor(`${base}/api/status`, child);
    say(`npx started the packed server on ${base}`);
    const problems = await problemsOf(base);
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
    say('PASS: the packed package runs and serves the app');
  } catch (error) {
    console.error(`[pack-smoke] FAIL: ${error.message}\n${log}`);
    process.exitCode = 1;
  } finally {
    stop(child);
    await sleep(1000);
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
};

await main();
