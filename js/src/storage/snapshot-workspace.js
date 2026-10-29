import { promises as fs } from 'node:fs';
import path from 'node:path';

// A killed encoder is cleaned by its parent. After a whole-process crash,
// reclaim only workspaces whose recorded owner no longer exists. A rolling
// reader must never remove the active writer's workspace.
export const sweepSnapshotWorkspaces = async (dir) => {
  for (const name of await fs.readdir(dir).catch(() => [])) {
    const owner = /^\.snapshot-db-(\d+)-/.exec(name);
    if (!owner) {
      continue;
    }
    try {
      process.kill(Number(owner[1]), 0);
    } catch (error) {
      if (error.code === 'ESRCH') {
        await fs.rm(path.join(dir, name), { recursive: true, force: true });
      }
    }
  }
};
