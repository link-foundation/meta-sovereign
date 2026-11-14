import { describe, it, expect } from 'test-anywhere';
import { Readable } from 'node:stream';
import {
  browserPolicyId,
  browserPolicyLink,
  defaultBrowserPolicy,
  listBrowserPolicies,
  resolveBrowserPolicy,
  saveBrowserPolicy,
} from '../src/browser/policy.js';
import { createMemoryStore } from '../src/storage/index.js';
import { createContext } from '../src/storage/migrations/core.js';
import * as migration from '../src/storage/migrations/0007-browser-policy.js';
import { createBrowserCommands } from '../src/cli/browser-commands.js';
import { handleBrowserRoutes } from '../src/server/routes-browser.js';
import { slotProfileDir } from '../src/cv/browser.js';

const route = async (store, method, body, options = {}) => {
  const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
  req.method = method;
  req.headers = { 'content-type': 'application/json', ...options.headers };
  let result;
  const res = {
    writeHead(status) {
      result = { status };
    },
    end(raw) {
      result.body = JSON.parse(raw);
    },
  };
  const url = new URL(
    `http://localhost/api/browser/policies${options.query ?? ''}`
  );
  await handleBrowserRoutes(store, req, res, url.pathname, url, {});
  return result;
};

describe('browser visibility policies', () => {
  it('resolves run > slot > workflow > default with null inheriting', async () => {
    const store = createMemoryStore();
    const target = { platform: 'hh', useCase: 'cv', slot: 'forms' };
    expect((await resolveBrowserPolicy(store, target)).headless).toBe(false);
    await saveBrowserPolicy(store, { scope: 'default', headless: true });
    await saveBrowserPolicy(store, {
      scope: 'case',
      key: 'cv',
      headless: false,
    });
    expect((await resolveBrowserPolicy(store, target)).scope).toBe('case');
    await saveBrowserPolicy(store, {
      scope: 'slot',
      key: 'hh/forms',
      headless: true,
    });
    expect((await resolveBrowserPolicy(store, target)).headless).toBe(true);
    expect(
      (await resolveBrowserPolicy(store, { ...target, headless: false }))
        .headless
    ).toBe(false);
    await saveBrowserPolicy(store, {
      scope: 'slot',
      key: 'hh/forms',
      headless: null,
    });
    expect((await resolveBrowserPolicy(store, target)).headless).toBe(false);
    expect(
      (
        await resolveBrowserPolicy(store, {
          ...target,
          platform: 'vk',
          useCase: 'messages',
        })
      ).headless
    ).toBe(true);
    const reopened = createMemoryStore();
    await reopened.putMany(await store.query());
    expect(await listBrowserPolicies(reopened)).toEqual(
      await listBrowserPolicies(store)
    );
  });

  it('rejects malformed values and profile traversal before any launch', () => {
    for (const policy of [
      { scope: 'default', headless: 'false' },
      { scope: 'default', headless: null },
      { scope: 'case', key: '../cv', headless: true },
      { scope: 'slot', key: 'hh/../../other', headless: true },
      { scope: 'slot', key: 'hh/', headless: true },
      { scope: 'unknown', headless: false },
    ]) {
      expect(() => browserPolicyLink(policy)).toThrow();
    }
    expect(() => slotProfileDir('/fixture/profile', '..')).toThrow();
    expect(slotProfileDir('/fixture/profile', 'main')).toBe('/fixture/profile');
    expect(slotProfileDir('/fixture/profile', 'forms')).toMatch(
      /profile[/\\]slots[/\\]forms$/
    );
  });

  it('uses separate records so concurrent independent changes both survive', async () => {
    const store = createMemoryStore();
    await Promise.all([
      saveBrowserPolicy(store, { scope: 'case', key: 'cv', headless: true }),
      saveBrowserPolicy(store, {
        scope: 'slot',
        key: 'hh/forms',
        headless: false,
      }),
    ]);
    expect((await listBrowserPolicies(store)).length).toBe(2);
  });
});

describe('browser policy migration', () => {
  it('adds a visible default to a schema-6 fixture and is idempotent', async () => {
    const store = createMemoryStore();
    const old = { id: 'msg:hh:1', body: 'fixture' };
    await store.putMany([old, { id: 'meta:schema', version: 6 }]);
    const first = createContext(store, migration);
    await migration.up(first);
    expect(first.stats.changed).toBe(1);
    expect(await store.get(defaultBrowserPolicy().id)).toEqual(
      defaultBrowserPolicy()
    );
    expect(await store.get(old.id)).toEqual(old);
    const again = createContext(store, migration);
    await migration.up(again);
    expect(again.stats.changed).toBe(0);
  });

  it('dry-run counts one new link without writing and preserves restored preferences', async () => {
    const store = createMemoryStore();
    const dry = createContext(store, migration, { dryRun: true });
    await migration.up(dry);
    expect(dry.stats.changed).toBe(1);
    expect((await store.query()).length).toBe(0);
    await saveBrowserPolicy(store, { scope: 'default', headless: true });
    const restored = createContext(store, migration);
    await migration.up(restored);
    expect(restored.stats.changed).toBe(0);
    expect((await resolveBrowserPolicy(store)).headless).toBe(true);
  });
});

describe('browser preferences control surfaces', () => {
  it('configures and resolves a named slot through the CLI', async () => {
    const store = createMemoryStore();
    const commands = createBrowserCommands({ openStore: async () => store });
    const out = [];
    await commands['browser-configure'](
      { scope: 'slot', key: 'hh/forms', mode: 'headless' },
      (s) => out.push(JSON.parse(s))
    );
    await commands['browser-policies']({ platform: 'hh', slot: 'forms' }, (s) =>
      out.push(JSON.parse(s))
    );
    expect(out[0].id).toBe(browserPolicyId('slot', 'hh/forms'));
    expect(out[1].resolved.headless).toBe(true);
  });

  it('saves and resolves API preferences and rejects invalid or untrusted writes', async () => {
    const store = createMemoryStore();
    expect(
      (await route(store, 'POST', { scope: 'case', key: 'cv', headless: true }))
        .status
    ).toBe(200);
    const read = await route(store, 'GET', null, {
      query: '?platform=hh&useCase=cv',
    });
    expect(read.body.resolved.headless).toBe(true);
    expect(
      (await route(store, 'POST', { scope: 'default', headless: 'false' }))
        .status
    ).toBe(400);
    expect(
      (
        await route(
          store,
          'POST',
          { scope: 'default', headless: true },
          { headers: { origin: 'https://untrusted.invalid' } }
        )
      ).status
    ).toBe(403);
    expect((await route(store, 'DELETE')).status).toBe(405);
  });
});
