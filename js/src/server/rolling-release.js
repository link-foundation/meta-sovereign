// Immutable package snapshots: the old worker never imports files being edited
// or replaced by an installer while its replacement prepares.
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const PACKAGE_ROOT = fileURLToPath(
  new URL('../../../', import.meta.url)
);
export const rollingDirectory = (storeDir) => path.join(storeDir, 'runtime');
const releaseDirectory = (storeDir) =>
  path.join(rollingDirectory(storeDir), 'releases');
const namesIn = async (root, relative) => {
  const entries = await fs.readdir(path.join(root, relative), {
    withFileTypes: true,
  });
  const all = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? namesIn(root, path.join(relative, entry.name))
        : [path.join(relative, entry.name)]
    )
  );
  return all.flat();
};
const runtimeFiles = async (root) => {
  const files = [
    ...(await namesIn(root, 'js/src')),
    ...(await namesIn(root, 'js/bin')),
    'package.json',
  ];
  for (const file of ['package-lock.json', 'bun.lock', 'deno.lock']) {
    if (await fs.stat(path.join(root, file)).catch(() => null)) {
      files.push(file);
    }
  }
  return files.sort();
};
const digest = async (root, names) => {
  const hash = createHash('sha256');
  for (const name of names) {
    hash.update(name);
    hash.update('\0');
    hash.update(await fs.readFile(path.join(root, name)));
    hash.update('\0');
  }
  return hash.digest('hex');
};
const dependencyDirectory = async (sourceRoot) => {
  for (let root = sourceRoot; ; root = path.dirname(root)) {
    const modules = path.join(root, 'node_modules');
    if (
      await fs.stat(path.join(modules, 'lino-objects-codec')).catch(() => null)
    ) {
      return fs.realpath(modules);
    }
    if (path.dirname(root) === root) {
      throw new Error('cannot locate the installed runtime dependencies');
    }
  }
};

export const verifyRelease = async (storeDir, release) => {
  if (!/^[a-f0-9]{64}$/.test(release?.build ?? '')) {
    throw new Error('invalid server release');
  }
  const root = path.join(releaseDirectory(storeDir), release.build);
  if (
    path.resolve(release.entry) !== path.join(root, 'js/bin/server-worker.js')
  ) {
    throw new Error('invalid release entry');
  }
  const manifest = JSON.parse(
    await fs.readFile(path.join(root, 'release.json'), 'utf8')
  );
  if (
    !Array.isArray(manifest.files) ||
    manifest.files.some(
      (name) =>
        typeof name !== 'string' ||
        path.isAbsolute(name) ||
        name.split(/[\\/]/).includes('..')
    )
  ) {
    throw new Error('invalid release manifest');
  }
  if ((await digest(root, manifest.files)) !== release.build) {
    throw new Error('the prepared server release changed');
  }
  return release;
};

export const stageServerRelease = async ({
  storeDir,
  sourceRoot = PACKAGE_ROOT,
}) => {
  const startedAt = Date.now();
  const trace = (stage, count) => {
    if (process.env.MS_RELEASE_DEBUG === '1') {
      console.error(
        `[release] ${stage} after ${Date.now() - startedAt} ms (${count} files)`
      );
    }
  };
  const files = await runtimeFiles(sourceRoot);
  trace('enumerated', files.length);
  const build = await digest(sourceRoot, files);
  trace('hashed', files.length);
  const root = path.join(releaseDirectory(storeDir), build);
  const release = { build, entry: path.join(root, 'js/bin/server-worker.js') };
  if (await fs.stat(root).catch(() => null)) {
    const verified = await verifyRelease(storeDir, release);
    trace('reused_verified', files.length);
    return verified;
  }
  const temp = `${root}.preparing-${process.pid}-${randomBytes(4).toString('hex')}`;
  await fs.mkdir(temp, { recursive: true, mode: 0o700 });
  try {
    for (const name of files) {
      const destination = path.join(temp, name);
      await fs.mkdir(path.dirname(destination), {
        recursive: true,
        mode: 0o700,
      });
      await fs.copyFile(path.join(sourceRoot, name), destination);
    }
    trace('copied', files.length);
    if ((await digest(temp, files)) !== build) {
      throw new Error(
        'server files changed while preparing the release; retry with the current version'
      );
    }
    await fs.symlink(
      await dependencyDirectory(sourceRoot),
      path.join(temp, 'node_modules'),
      process.platform === 'win32' ? 'junction' : 'dir'
    );
    await fs.writeFile(
      path.join(temp, 'release.json'),
      JSON.stringify({ build, files }),
      { mode: 0o600 }
    );
    await fs.rename(temp, root).catch(async (error) => {
      if (!['EEXIST', 'ENOTEMPTY'].includes(error.code)) {
        throw error;
      }
      await verifyRelease(storeDir, release);
    });
    trace('ready', files.length);
    return release;
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
};
