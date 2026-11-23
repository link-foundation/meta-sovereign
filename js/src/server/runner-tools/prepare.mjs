// This module runs on the execution host, including through the SSH transport.
// Keep its inputs self-contained so the host needs no copy of the controller.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const packageManagerUnavailable = new Error('npm is unavailable');
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const directory = async (file) => {
  const info = await lstat(file);
  if (!info.isDirectory() || info.uid !== process.getuid()) {
    throw new Error('Unowned runner tool directory.');
  }
  return info;
};

const cacheDirectory = async () => {
  const home = await realpath(homedir());
  if ((await directory(home)).mode & 0o022) {
    throw new Error('Runner tools require an owner-controlled home.');
  }
  const cache = join(home, '.meta-sovereign-runner-tools');
  try {
    await mkdir(cache, { mode: 0o700 });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
  if ((await directory(cache)).mode & 0o077) {
    throw new Error('Runner tools require a private cache.');
  }
  return cache;
};

const bunExecutable = ({ platform, arch, report }) => {
  const machine = { arm64: 'aarch64', x64: 'x64' }[arch];
  const libc =
    platform === 'linux' && !report.getReport().header.glibcVersionRuntime
      ? '-musl'
      : '';
  return `@oven/bun-${platform}-${machine}${libc}/bin/bun`;
};

const launcher = async (folder, dependencies) => {
  const modules = join(folder, 'node_modules');
  const bun = join(modules, bunExecutable(process));
  const start = join(modules, 'start-command', 'src', 'bin', 'cli.js');
  const manifest = await readJson(
    join(modules, 'start-command', 'package.json')
  );
  if (manifest.version !== dependencies['start-command']) {
    throw new Error('Unexpected start-command package version.');
  }
  const probe = { cwd: folder, timeout: 5000, maxBuffer: 16 * 1024 };
  const { stdout } = await execute(bun, ['--version'], probe);
  if (stdout.trim() !== dependencies.bun) {
    throw new Error('Unexpected Bun executable version.');
  }
  await execute(bun, [start, '--version'], probe);
  return [bun, start];
};

const install = async (stage, lockText, root, npm) => {
  await writeFile(join(stage, 'package.json'), JSON.stringify(root), {
    mode: 0o600,
  });
  await writeFile(join(stage, 'package-lock.json'), lockText, { mode: 0o600 });
  // Use the locked public artifacts without host npmrc or package lifecycle code.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !/^npm_config_/i.test(key))
  );
  try {
    await execute(
      npm ? process.execPath : 'npm',
      [
        ...(npm ? [npm] : []),
        'ci',
        '--ignore-scripts',
        '--omit=dev',
        '--include=optional',
        '--no-audit',
        '--no-fund',
        '--registry=https://registry.npmjs.org/',
        '--userconfig=/dev/null',
        `--globalconfig=${join(stage, 'global.npmrc')}`,
        `--cache=${join(stage, '.npm-cache')}`,
        '--loglevel=error',
        '--fetch-retries=0',
        '--fetch-timeout=30000',
      ],
      { cwd: stage, env, timeout: 75000, maxBuffer: 32 * 1024 }
    );
  } catch (error) {
    if (!npm && error.code === 'ENOENT' && error.path === 'npm') {
      throw packageManagerUnavailable;
    }
    throw error;
  }
};

const publish = async (cache, destination, lockText, root, npm) => {
  const stage = await mkdtemp(join(cache, 'stage-'));
  try {
    await install(stage, lockText, root, npm);
    await launcher(stage, root.dependencies);
    await rm(join(stage, '.npm-cache'), { recursive: true, force: true });
    try {
      await rename(stage, destination);
    } catch (error) {
      // Another explicit Start can finish preparation on the same SSH host.
      if (!['EEXIST', 'ENOTEMPTY'].includes(error.code)) {
        throw error;
      }
    }
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
};

const prepare = async (lockText, npm) => {
  const root = JSON.parse(lockText).packages[''];
  const cache = await cacheDirectory();
  const revision = createHash('sha256').update(lockText).digest('hex');
  const destination = join(
    cache,
    `${process.platform}-${process.arch}-${revision}`
  );
  try {
    await directory(destination);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    await publish(cache, destination, lockText, root, npm);
  }
  await directory(destination);
  return launcher(destination, root.dependencies);
};

try {
  const prefix = await prepare(process.argv[1], process.argv[2]);
  process.stdout.write(`${JSON.stringify(prefix)}\n`);
} catch (error) {
  if (error === packageManagerUnavailable) {
    process.stdout.write('npm-unavailable\n');
  } else if (process.env.MS_RUNNER_CONTROL_DEBUG === '1') {
    console.error('[runner-control] private launcher preparation failed');
  }
  process.exitCode = 1;
}
