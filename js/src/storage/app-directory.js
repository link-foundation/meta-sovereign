// A single durable store per OS user, independent of the shell's cwd.
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { renameDurable } from './durable.js';
import { acquireStoreLock } from './store-lock.js';

export const defaultStoreDir = ({
  platform = process.platform,
  home = os.homedir(),
  env = process.env,
} = {}) => {
  if (env.META_SOVEREIGN_STORE_DIR) {
    return path.resolve(env.META_SOVEREIGN_STORE_DIR);
  }
  const base =
    platform === 'darwin'
      ? path.join(home, 'Library', 'Application Support')
      : platform === 'win32'
        ? env.APPDATA || path.join(home, 'AppData', 'Roaming')
        : env.XDG_CONFIG_HOME || path.join(home, '.config');
  return path.join(base, 'Meta Sovereign', 'store');
};

const exists = async (file) =>
  fs.stat(file).then(
    () => true,
    () => false
  );
const hasStore = async (dir) =>
  (await exists(path.join(dir, 'data.lino'))) ||
  (await exists(path.join(dir, 'data.bin')));

/** Move a legacy cwd store once, retaining a link for old media paths. */
export const resolveUserStore = async ({
  cwd = process.cwd(),
  destination = defaultStoreDir(),
  log = () => {},
} = {}) => {
  const legacy = path.join(cwd, '.meta-sovereign');
  const target = path.resolve(destination);
  const realTarget = await fs.realpath(target).catch(() => null);
  if (!(await hasStore(legacy)) || (await fs.realpath(legacy)) === realTarget) {
    return target;
  }
  if (await hasStore(target)) {
    throw Object.assign(
      new Error(
        `Both ${legacy} and ${target} contain stores. Use --store=<directory> to choose one; automatic migration will not overwrite either.`
      ),
      { code: 'STORE_MIGRATION_CONFLICT' }
    );
  }
  const lock = await acquireStoreLock(legacy);
  try {
    await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    if (await exists(target)) {
      // Preserve even an unused desktop folder; never delete user files.
      await renameDurable(target, `${target}.before-migration-${Date.now()}`);
    }
    await renameDurable(legacy, target);
    try {
      await fs.symlink(
        target,
        legacy,
        process.platform === 'win32' ? 'junction' : 'dir'
      );
    } catch (error) {
      // Restore the old location when a compatibility link cannot be made.
      await renameDurable(target, legacy);
      throw error;
    }
    await fs.chmod(target, 0o700);
    log(`migrated local data → ${target}`);
    return target;
  } finally {
    lock.release();
  }
};
