import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatIndented } from 'lino-objects-codec';

export const automationDefaultsFixture = async (run) => {
  const cwd = await mkdtemp(join(tmpdir(), 'ms-bot-configuration-'));
  const globalDir = join(cwd, 'user');
  const localDir = join(cwd, 'app');
  await mkdir(globalDir);
  await mkdir(localDir);
  const file = (scope) =>
    join(scope === 'global' ? globalDir : localDir, 'config.lino');
  const put = (scope, automations, server) =>
    writeFile(
      file(scope),
      formatIndented({
        id: 'configuration',
        obj: { automations, ...(server ? { server } : {}) },
      })
    );
  try {
    await run({
      cwd,
      globalDir,
      localDir,
      file,
      put,
      text: (scope) => readFile(file(scope), 'utf8'),
    });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
};

// Each destination and message is synthetic and requires no provider access.
export const sixAutomationDefaults = {
  vk: {
    online: { enabled: false, everyMinutes: 5 },
    friends: { everyMinutes: 31, batchSize: 2, priorityIds: [7, 8] },
    cleanup: { everyMinutes: 41, limit: 3, priorityIds: [8] },
    outgoing: { everyMinutes: 11, limit: 2, priorityIds: [9] },
    wall: { everyMinutes: 9, communities: [100, 101] },
    birthday: { everyMinutes: 1380, messages: ['Fixture greeting'] },
  },
};
