import { describe, it, expect } from 'test-anywhere';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMemoryStore } from '../src/storage/index.js';
import { saveBrowserPolicy } from '../src/browser/policy.js';
import { createAutoImportManager } from '../src/sources/auto-import/index.js';
import { createBrowserSender } from '../src/sources/browser-sender.js';
import { waitFor } from './helpers/wait-for.js';

describe('persisted policy at browser launch boundaries', () => {
  it('isolates active import slots, profiles and downloads and honors their policies', async () => {
    const store = createMemoryStore();
    await saveBrowserPolicy(store, {
      scope: 'case',
      key: 'auto-import',
      headless: true,
    });
    await saveBrowserPolicy(store, {
      scope: 'slot',
      key: 'telegram/forms',
      headless: false,
    });
    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'ms-policy-import-'));
    const launches = [];
    const manager = createAutoImportManager({
      store,
      dataDir,
      env: {},
      launcher: async (options) => {
        launches.push(options);
        return { commander: {}, close: async () => {} };
      },
    });
    try {
      const main = manager.start('telegram');
      const forms = manager.start('telegram', { slot: 'forms' });
      expect(main.id === forms.id).toBe(false);
      expect(manager.start('telegram', { slot: 'forms' }).id).toBe(forms.id);
      await waitFor(() => manager.list().every((j) => j.state === 'waiting'), {
        timeoutMs: 2000,
        what: 'two fake sessions',
      });
      expect(launches.length).toBe(2);
      expect(launches.find((l) => l.headless === true).userDataDir).toBe(
        path.join(dataDir, 'auto-import', 'profiles', 'telegram')
      );
      const isolated = launches.find((l) => l.headless === false);
      expect(isolated.userDataDir).toBe(
        path.join(
          dataDir,
          'auto-import',
          'profiles',
          'telegram',
          'slots',
          'forms'
        )
      );
      expect(isolated.downloadsDir).toBe(
        path.join(
          dataDir,
          'auto-import',
          'downloads',
          'telegram',
          'slots',
          'forms'
        )
      );
      expect(() => manager.start('telegram', { slot: '../other' })).toThrow();
    } finally {
      await manager.close();
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it('passes message slot visibility and its isolated profile to the session', async () => {
    const store = createMemoryStore();
    await saveBrowserPolicy(store, {
      scope: 'slot',
      key: 'vk/support',
      headless: true,
    });
    let launched;
    const sender = createBrowserSender({
      store,
      slot: 'support',
      profileDirFor: () => '/fixture/profiles/vk',
      openSession: async (options) => {
        launched = options;
        return {
          commander: {
            goto: async () => {},
            count: async () => 1,
            evaluate: async () => [],
          },
          close: async () => {},
        };
      },
    });
    try {
      await sender.readChats({ source: 'vk' });
      expect(launched.headless).toBe(true);
      expect(launched.profileDir).toBe(
        path.join('/fixture/profiles/vk', 'slots', 'support')
      );
    } finally {
      await sender.close();
    }
  });
});
