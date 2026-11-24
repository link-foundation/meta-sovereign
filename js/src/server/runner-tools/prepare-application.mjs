// This isolated program runs in the selected worker runtime.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cp,
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
import { promisify } from 'node:util';

const execute = promisify(execFile);
const abort = new AbortController();
const stop = () => abort.abort();
process.once('SIGTERM', stop);
process.once('SIGINT', stop);

const ownedDirectory = async (directory, disallowedMode) => {
  const info = await lstat(directory);
  if (
    !info.isDirectory() ||
    info.uid !== process.getuid() ||
    info.mode & disallowedMode
  ) {
    throw new Error(
      'The application directory is not controlled by the runner user.'
    );
  }
};

const recipeFile = async (root, name) => {
  const file = join(root, name);
  const info = await lstat(file);
  if (!info.isFile() || info.size > 2 * 1024 * 1024) {
    throw new Error('The application lockfile or manifest is invalid.');
  }
  return readFile(file);
};

const readRecipe = async (root, approval) => {
  const lock = await recipeFile(root, 'package-lock.json');
  if (createHash('sha256').update(lock).digest('hex') !== approval) {
    throw new Error('The application lock differs from the reviewed lock.');
  }
  const manifest = await recipeFile(root, 'package.json');
  const { packages, lockfileVersion } = JSON.parse(lock);
  if (
    JSON.parse(manifest).name !== 'meta-sovereign' ||
    lockfileVersion !== 3 ||
    packages?.['']?.name !== 'meta-sovereign'
  ) {
    throw new Error('A Meta Sovereign application lockfile is required.');
  }
  const artifacts = [];
  for (const [name, entry] of Object.entries(packages)) {
    if (!name) {
      continue;
    }
    if (entry.link || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(entry.integrity)) {
      throw new Error('A locked dependency has no verified artifact.');
    }
    if (
      /^https:\/\/registry\.npmjs\.org\/[A-Za-z0-9@%._/+~-]+\.tgz$/.test(
        entry.resolved
      )
    ) {
      continue;
    }
    const local =
      /^file:(vendor\/picomatch\/picomatch-[A-Za-z0-9.-]+\.tgz)$/.exec(
        entry.resolved
      );
    if (!local) {
      throw new Error(
        'A locked dependency is outside the approved artifact sources.'
      );
    }
    artifacts.push(local[1]);
  }
  return { lock, manifest, artifacts };
};

const install = async (stage, root, recipe, npm) => {
  await writeFile(join(stage, 'package.json'), recipe.manifest, {
    mode: 0o600,
  });
  await writeFile(join(stage, 'package-lock.json'), recipe.lock, {
    mode: 0o600,
  });
  for (const artifact of recipe.artifacts) {
    await mkdir(dirname(join(stage, artifact)), {
      recursive: true,
      mode: 0o700,
    });
    await cp(join(root, artifact), join(stage, artifact), {
      dereference: true,
    });
  }
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !/^npm_config_/i.test(key))
  );
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
    {
      cwd: stage,
      env,
      signal: abort.signal,
      timeout: 75000,
      maxBuffer: 32 * 1024,
    }
  );
};

const verify = async (stage, root, program) => {
  const js = join(stage, 'js');
  await mkdir(js, { mode: 0o700 });
  for (const part of ['bin', 'src']) {
    await cp(join(root, 'js', part), join(js, part), { recursive: true });
  }
  const result = await execute(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      program,
      join(js, 'bin', 'meta-sovereign.js'),
    ],
    { cwd: stage, signal: abort.signal, timeout: 9000, maxBuffer: 16 * 1024 }
  );
  if (result.stdout !== 'loaded' || result.stderr.trim()) {
    throw new Error('The staged application did not load.');
  }
  for (const folder of [js, join(stage, 'vendor'), join(stage, '.npm-cache')]) {
    await rm(folder, { recursive: true, force: true });
  }
};

const prepare = async (cli, approval, npm, program) => {
  const root = await realpath(dirname(dirname(dirname(cli))));
  if (join(root, 'js', 'bin', 'meta-sovereign.js') !== (await realpath(cli))) {
    throw new Error('The CLI must be inside the reviewed application.');
  }
  await ownedDirectory(root, 0o022);
  const modules = join(root, 'node_modules');
  try {
    await lstat(modules);
    return 'present';
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
  const recipe = await readRecipe(root, approval);
  const cache = join(root, '.meta-sovereign-runner-app');
  try {
    await mkdir(cache, { mode: 0o700 });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
  await ownedDirectory(cache, 0o077);
  const stage = await mkdtemp(join(cache, 'stage-'));
  let published = false;
  try {
    await install(stage, root, recipe, npm);
    await verify(stage, root, program);
    abort.signal.throwIfAborted();
    try {
      // Create only a missing link. A concurrent install or owner installation wins.
      await symlink(
        relative(root, join(stage, 'node_modules')),
        modules,
        'dir'
      );
    } catch (error) {
      if (error.code === 'EEXIST') {
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
  process.stdout.write(await prepare(...process.argv.slice(1)));
} catch (error) {
  if (error.code === 'ENOENT' && error.path === 'npm') {
    process.stdout.write('npm-unavailable');
  } else if (process.env.MS_RUNNER_CONTROL_DEBUG === '1') {
    console.error('[runner-control] application dependency preparation failed');
  }
  process.exitCode = 1;
}
