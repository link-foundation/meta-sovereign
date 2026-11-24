// Runs on the destination host before an application directory exists.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { createGunzip } from 'node:zlib';

const execute = promisify(execFile);
const abort = new AbortController();
const stop = () => abort.abort();
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
const deadline = globalThis.setTimeout(stop, 85000);
const signal = abort.signal;
const marker = '.meta-sovereign-runner-source.json';
const mib = 1024 * 1024;
let phase = 'destination';

const lookup = async (file) => {
  try {
    return await lstat(file);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
};
const ownedDirectory = async (directory, writableMode) => {
  const info = await lstat(directory);
  if (
    !info.isDirectory() ||
    info.uid !== process.getuid() ||
    info.mode & writableMode
  ) {
    throw new Error('An owner-controlled destination parent is required.');
  }
};
const bytes = (limit, hash) => {
  let length = 0;
  return new Transform({
    transform(chunk, _encoding, done) {
      length += chunk.length;
      if (length > limit) {
        done(new Error('The runner source exceeds its size bound.'));
      } else {
        hash?.update(chunk);
        done(null, chunk);
      }
    },
  });
};
const artifactHosts = new Set([
  'github.com',
  'release-assets.githubusercontent.com',
  'objects.githubusercontent.com',
]);
const download = async (source, file, approval) => {
  const hash = createHash('sha256');
  let url = new URL(source);
  for (let redirects = 0; redirects < 4; redirects++) {
    if (
      url.protocol !== 'https:' ||
      !artifactHosts.has(url.host) ||
      url.username ||
      url.password
    ) {
      break;
    }
    const response = await fetch(url, { redirect: 'manual', signal });
    const location = response.headers.get('location');
    if (location && [301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      url = new URL(location, url);
      continue;
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      break;
    }
    await pipeline(
      Readable.fromWeb(response.body),
      bytes(24 * mib, hash),
      createWriteStream(file, { flags: 'wx', mode: 0o600 }),
      { signal }
    );
    if (hash.digest('hex') !== approval) {
      throw new Error('The source archive differs from the reviewed digest.');
    }
    return;
  }
  throw new Error('The approved release archive was unavailable.');
};

const tar = (args) =>
  execute('tar', args, { signal, timeout: 10000, maxBuffer: 2 * mib });
const entry = (name) =>
  !name.split('/').some((part) => part === '.' || part === '..') &&
  /^(?:js\/(?:bin|src)(?:\/[A-Za-z0-9._+%-]+)*\/?|js\/|vendor\/|vendor\/picomatch\/|vendor\/picomatch\/picomatch-[A-Za-z0-9.-]+\.tgz|package(?:-lock)?\.json)$/u.test(
    name
  );
const expectedFiles = [
  'package.json',
  'package-lock.json',
  'js/bin/meta-sovereign.js',
  'js/src/server/index.js',
];
const unpack = async (archive, stage, root) => {
  const file = join(stage, 'source.tar');
  await pipeline(
    createReadStream(archive),
    createGunzip(),
    bytes(64 * mib),
    createWriteStream(file, { flags: 'wx', mode: 0o600 }),
    { signal }
  );
  const names = (await tar(['-tf', file])).stdout
    .replace(/\n$/u, '')
    .split('\n');
  const listing = (await tar(['-tvf', file])).stdout
    .replace(/\n$/u, '')
    .split('\n');
  const distinct = new Set(names.map((name) => name.replace(/\/$/u, '')));
  if (
    names.length > 4096 ||
    names.length !== distinct.size ||
    names.length !== listing.length ||
    names.some((name) => !entry(name)) ||
    listing.some((line) => !/^[-d]/u.test(line)) ||
    !expectedFiles.every((name) => distinct.has(name))
  ) {
    throw new Error('The archive has unsupported entries.');
  }
  await tar([
    '-xf',
    file,
    '--no-same-owner',
    '--no-same-permissions',
    '-C',
    root,
  ]);
};
const recipeMatches = async (root, release, lock) => {
  const [manifest, locked] = await Promise.all(
    ['package.json', 'package-lock.json'].map(async (name) => {
      const file = join(root, name);
      const info = await lstat(file);
      if (!info.isFile() || info.size > 2 * mib) {
        throw new Error('The source recipe is invalid.');
      }
      return readFile(file);
    })
  );
  const { name, version } = JSON.parse(manifest);
  return (
    name === 'meta-sovereign' &&
    `v${version}` === release &&
    createHash('sha256').update(locked).digest('hex') === lock
  );
};

const present = async (directory, cache, reviewed) => {
  const info = await lookup(directory);
  if (!info) {
    return false;
  }
  if (!info.isSymbolicLink() || info.uid !== process.getuid()) {
    throw new Error('An existing application directory is owner-managed.');
  }
  await ownedDirectory(cache, 0o077);
  const root = await realpath(directory);
  if (
    dirname(dirname(root)) !== cache ||
    !/^source-[A-Za-z0-9]+\/application$/u.test(relative(cache, root))
  ) {
    throw new Error('An existing application link is owner-managed.');
  }
  await ownedDirectory(root, 0o077);
  const receipt = join(root, marker);
  const receiptInfo = await lstat(receipt);
  if (
    !receiptInfo.isFile() ||
    receiptInfo.size > 512 ||
    (await readFile(receipt, 'utf8')) !== JSON.stringify(reviewed) ||
    !(await recipeMatches(root, reviewed.release, reviewed.lock))
  ) {
    throw new Error(
      'The existing application source does not match this review.'
    );
  }
  return true;
};

const deploy = async (destination, release, lock, approval, source) => {
  const parent = await realpath(dirname(destination));
  await ownedDirectory(parent, 0o022);
  const cache = join(parent, '.meta-sovereign-runner-source');
  const reviewed = { version: 1, release, lock, approval };
  if (await present(destination, cache, reviewed)) {
    return 'present';
  }
  try {
    await mkdir(cache, { mode: 0o700 });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
  await ownedDirectory(cache, 0o077);
  const stage = await mkdtemp(join(cache, 'source-'));
  const root = join(stage, 'application');
  const archive = join(stage, 'source.tar.gz');
  let published = false;
  try {
    await mkdir(root, { mode: 0o700 });
    phase = 'download';
    await download(source, archive, approval);
    phase = 'archive';
    await unpack(archive, stage, root);
    phase = 'recipe';
    if (!(await recipeMatches(root, release, lock))) {
      throw new Error(
        'The source does not match the reviewed release and lock.'
      );
    }
    await writeFile(join(root, marker), JSON.stringify(reviewed), {
      flag: 'wx',
      mode: 0o600,
    });
    await Promise.all([rm(archive), rm(join(stage, 'source.tar'))]);
    signal.throwIfAborted();
    phase = 'publish';
    try {
      await symlink(relative(parent, root), destination, 'dir');
    } catch (error) {
      if (
        error.code === 'EEXIST' &&
        (await present(destination, cache, reviewed))
      ) {
        return 'present';
      }
      throw error;
    }
    published = true;
    return 'prepared';
  } finally {
    if (!published) {
      await rm(stage, { recursive: true, force: true });
    }
  }
};

try {
  process.stdout.write(await deploy(...process.argv.slice(1)));
} catch {
  if (process.env.MS_RUNNER_CONTROL_DEBUG === '1') {
    console.error(
      `[runner-control] reviewed source preparation failed at ${phase}`
    );
  }
  process.exitCode = 1;
} finally {
  globalThis.clearTimeout(deadline);
}
