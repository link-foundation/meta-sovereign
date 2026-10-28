import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { fixtureServerClose } from './helpers/fixture-server.mjs';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  MARKETPLACES,
  marketplaceProfileUrl,
  marketplaceProfileId,
} from '../src/marketplaces/catalogue.js';
import {
  cleanMarketplaceProfile,
  createMarketplaceSessions,
} from '../src/marketplaces/sessions.js';
import { handleMarketplaceRoutes } from '../src/server/routes-marketplaces.js';

const PROFILE_URLS = {
  upwork: 'https://www.upwork.com/freelancers/~fake123',
  fiverr: 'https://www.fiverr.com/fake_person',
  peopleperhour:
    'https://www.peopleperhour.com/freelancer/development-it/fake-person-123',
  wellfound: 'https://wellfound.com/u/fake-person',
};
const now = new Date('2026-10-27T00:00:00Z');
const snapshot = (id) => ({
  url: PROFILE_URLS[id],
  name: 'Fake Person',
  headline: 'Developer',
  bio: 'Sample profile',
  skills: ['JS'],
  signInObserved: true,
  password: 'DO-NOT-COPY',
  access_token: 'DO-NOT-COPY',
});

const fakeBrowser = () => {
  let url = '';
  let closed = false;
  let read = null;
  let focused = 0;
  return {
    page: {
      goto: async (value) => {
        url = value;
      },
      url: () => url,
      isClosed: () => closed,
      bringToFront: async () => {
        focused += 1;
      },
      evaluate: async () => ({ ...read, url }),
    },
    close: async () => {
      closed = true;
    },
    data: (value) => {
      read = value;
    },
    focused: () => focused,
    context: {
      cookies: () => {
        throw new Error('Cookies must not be extracted');
      },
    },
  };
};

test('all issue #42 services have real login URLs and bounded profile paths', () => {
  assert.deepEqual(Object.keys(MARKETPLACES), [
    'upwork',
    'fiverr',
    'peopleperhour',
    'wellfound',
  ]);
  for (const id of Object.keys(MARKETPLACES)) {
    assert.match(MARKETPLACES[id].loginUrl, /^https:\/\//);
    assert.equal(
      marketplaceProfileUrl(
        id,
        `${PROFILE_URLS[id]}?access_token=private#fragment`
      ),
      PROFILE_URLS[id]
    );
    assert.equal(
      marketplaceProfileUrl(id, MARKETPLACES[id].loginUrl),
      null,
      'login is not a profile'
    );
    assert.equal(
      marketplaceProfileUrl(id, PROFILE_URLS[id].replace('https:', 'http:')),
      null
    );
    assert.equal(
      marketplaceProfileUrl(
        id,
        PROFILE_URLS[id].replace('.com/', '.com.evil.test/')
      ),
      null
    );
    assert.equal(
      marketplaceProfileUrl(
        id,
        'https://user:password@www.fiverr.com/fake_person'
      ),
      null
    );
    assert.equal(marketplaceProfileUrl(id, 'javascript:alert(1)'), null);
  }
  const data = cleanMarketplaceProfile('fiverr', snapshot('fiverr'), now);
  assert.equal(data.name, 'Fake Person');
  assert.equal(data.signInObservedAt, now.toISOString());
  assert(!JSON.stringify(data).includes('DO-NOT-COPY'));
  assert.throws(
    () =>
      cleanMarketplaceProfile(
        'fiverr',
        { ...snapshot('fiverr'), challenge: true },
        now
      ),
    /needs-profile/
  );
});

test('visible sessions reuse app-owned profiles and saved metadata survives controller restart', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-marketplaces-'));
  const store = createMemoryStore();
  const sessions = [];
  const launches = [];
  const options = {
    store,
    storeDir: dir,
    clock: () => now,
    openSession: async (args) => {
      launches.push(args);
      const session = fakeBrowser();
      sessions.push(session);
      return session;
    },
  };
  const service = createMarketplaceSessions(options);
  try {
    assert.equal((await service.list()).length, 4);
    assert.equal(launches.length, 0, 'reading status does not open a browser');
    for (const id of Object.keys(MARKETPLACES)) {
      const before = launches.length;
      await Promise.all([service.open(id), service.open(id)]);
      assert.equal(
        launches.length,
        before + 1,
        'concurrent open launches once'
      );
      const session = sessions.at(-1);
      assert.equal(launches.at(-1).headless, false);
      assert.equal(
        launches.at(-1).profileDir,
        path.join(dir, 'browser-profiles', id)
      );
      assert.equal(session.page.url(), MARKETPLACES[id].loginUrl);
      await assert.rejects(service.capture(id), /needs-profile/);
      await session.page.goto(`${PROFILE_URLS[id]}?access_token=private`);
      session.data(snapshot(id));
      const result = await service.capture(id);
      assert.equal(result.profile.url, PROFILE_URLS[id]);
      assert.equal(result.profile.name, 'Fake Person');
      assert(!JSON.stringify(result).includes('DO-NOT-COPY'));
      assert(!JSON.stringify(result).includes('access_token'));
      await service.open(id);
      assert.equal(
        launches.length,
        before + 1,
        'opening an existing session focuses it'
      );
      assert.equal(session.focused(), 1);
      await service.close(id);
      assert.equal(
        (await service.status(id)).profile.name,
        'Fake Person',
        'closing keeps profile metadata'
      );
    }
    const restarted = createMarketplaceSessions(options);
    const accounts = await restarted.list();
    assert(
      accounts.every(
        (account) => account.profile?.name === 'Fake Person' && !account.open
      )
    );
    await restarted.open('fiverr');
    assert.equal(
      sessions.at(-1).page.url(),
      PROFILE_URLS.fiverr,
      'reopening resumes the saved profile URL'
    );
    await restarted.stop();
    await assert.rejects(restarted.open('fiverr'), /server-stopping/);
    // Untrusted extra record properties are also stripped when reading later.
    const record = await store.get(marketplaceProfileId('fiverr'));
    await store.put({
      ...record,
      profile: { ...record.profile, cookies: 'PRIVATE' },
    });
    assert(!JSON.stringify(await service.status('fiverr')).includes('PRIVATE'));
  } finally {
    await service.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('marketplace routes reject foreign origins and browser options before launching', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-marketplace-routes-'));
  const store = createMemoryStore();
  let launches = 0;
  const session = fakeBrowser();
  const ctx = {
    storeDir: dir,
    allowOrigins: ['https://link-foundation.github.io'],
    marketplaceSessionOptions: {
      openSession: async () => {
        launches += 1;
        return session;
      },
    },
    log: () => {},
  };
  const server = http.createServer(async (req, res) => {
    try {
      if (
        !(await handleMarketplaceRoutes(
          store,
          req,
          res,
          new URL(req.url, 'http://local').pathname,
          ctx
        ))
      ) {
        res.writeHead(404);
        res.end();
      }
    } catch {
      res.writeHead(500);
      res.end();
    }
  });
  const close = fixtureServerClose(server, 'marketplaces');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (
    route,
    body = {},
    origin = 'https://link-foundation.github.io'
  ) =>
    fetch(base + route, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  try {
    assert.equal(
      (await (await fetch(`${base}/api/marketplaces`)).json()).accounts.length,
      4
    );
    assert.equal(launches, 0);
    assert.equal(
      (await post('/api/marketplaces/fiverr/open', {}, 'https://evil.test'))
        .status,
      403
    );
    assert.equal(
      (
        await post('/api/marketplaces/fiverr/open', {
          profileDir: '/tmp/other-person',
        })
      ).status,
      400
    );
    assert.equal(
      (await post('/api/marketplaces/fiverr/open', { password: 'DO-NOT-COPY' }))
        .status,
      400
    );
    assert.equal(launches, 0);
    assert.equal((await post('/api/marketplaces/unknown/open')).status, 404);
    assert.equal((await post('/api/marketplaces/fiverr/open')).status, 200);
    assert.equal(launches, 1);
    assert.equal((await post('/api/marketplaces/fiverr/profile')).status, 409);
    await session.page.goto(PROFILE_URLS.fiverr);
    session.data(snapshot('fiverr'));
    const saved = await (await post('/api/marketplaces/fiverr/profile')).json();
    assert.equal(saved.account.profile.name, 'Fake Person');
    assert.equal((await post('/api/marketplaces/fiverr/close')).status, 200);
  } finally {
    await ctx.marketplaceSessions?.stop();
    await close();
    await rm(dir, { recursive: true, force: true });
  }
});
