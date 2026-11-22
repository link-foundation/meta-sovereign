import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { loadCloudConfig } from '../src/server/cloud-config.js';
import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/index.js';

const requiresNode = { skip: Boolean(globalThis.Bun || globalThis.Deno) };
const key = () => randomBytes(32).toString('hex');
const fixtures = (host) => ({
  host,
  origin: `https://${host}`,
  ownerKey: key(),
  storeKey: key(),
  brand: { name: 'Northwind & <Workspace>', accent: '#067085', logo: null },
});

const rawRequest = (port, host, resource, { body, ...options }) =>
  new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: resource,
        ...options,
        headers: {
          host,
          ...(body ? { 'content-length': Buffer.byteLength(body) } : {}),
          ...options.headers,
        },
      },
      resolve
    );
    req.on('error', reject);
    req.end(body);
  });

const openWorkspace = async (host) => {
  const cloud = fixtures(host);
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'ms-cloud-test-'));
  const handle = await startServer({
    cloud,
    storeDir,
    store: createMemoryStore(),
    port: 0,
    tls: false,
    emailPoll: false,
    enableHandlers: false,
    backups: { enabled: false },
    automations: { scheduler: false },
  });
  const { port } = handle;
  const open = (resource, options = {}) =>
    rawRequest(port, host, resource, options);
  const request = async (resource, options) => {
    const res = await open(resource, options);
    const chunks = [];
    for await (const chunk of res) {
      chunks.push(chunk);
    }
    return {
      status: res.statusCode,
      headers: res.headers,
      body: Buffer.concat(chunks).toString(),
    };
  };
  const login = (supplied = cloud.ownerKey, origin = cloud.origin) =>
    request('/_cloud/sign-in', {
      method: 'POST',
      headers: { origin, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ key: supplied }).toString(),
    });
  return {
    port,
    cloud,
    request,
    open,
    login,
    async close() {
      await handle.close();
      await rm(storeDir, { recursive: true, force: true });
    },
  };
};

const session = ({ headers }) => headers['set-cookie'][0].split(';')[0];

test('cloud configuration validates origin, branding and distinct keys', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-cloud-config-'));
  const owner = path.join(dir, 'owner');
  const store = path.join(dir, 'store');
  const logo = path.join(dir, 'logo.png');
  const ownerKey = key();
  try {
    await writeFile(owner, `${ownerKey}\n`);
    await writeFile(store, key());
    await writeFile(logo, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]));
    const env = {
      MS_CLOUD_ORIGIN: 'https://workspace.example',
      MS_CLOUD_OWNER_KEY_FILE: owner,
      MS_CLOUD_STORE_KEY_FILE: store,
      MS_CLOUD_BRAND_NAME: 'Northwind',
      MS_CLOUD_BRAND_LOGO_FILE: logo,
    };
    const config = await loadCloudConfig(env);
    assert.equal(config.origin, env.MS_CLOUD_ORIGIN);
    assert.equal(config.ownerKey, ownerKey);
    assert.equal(config.brand.name, 'Northwind');
    for (const origin of [
      'http://workspace.example',
      'https://workspace.example/app',
      'https://owner@workspace.example',
    ]) {
      await assert.rejects(
        loadCloudConfig({ ...env, MS_CLOUD_ORIGIN: origin }),
        /bare HTTPS origin/
      );
    }
    await assert.rejects(
      loadCloudConfig({ ...env, MS_CLOUD_BRAND_ACCENT: 'red' }),
      /hex color/
    );
    await assert.rejects(
      loadCloudConfig({ ...env, MS_CLOUD_STORE_KEY_FILE: owner }),
      /separate/
    );
    await writeFile(logo, '<svg/>');
    await assert.rejects(loadCloudConfig(env), /PNG/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test(
  'workspace ingress authenticates every resource and rejects untrusted hosts and origins',
  requiresNode,
  async () => {
    const app = await openWorkspace('first.example');
    try {
      assert.equal(
        (await app.request('/')).headers.location,
        '/_cloud/sign-in'
      );
      for (const resource of [
        '/api/health',
        '/links',
        '/api/events',
        '/api/status',
        '/app.min.js',
        '/api/telegram/file/123',
      ]) {
        const response = await app.request(resource);
        assert.equal(response.status, 401, resource);
        assert.equal(response.headers['x-ms-workspace-session'], 'required');
      }
      const forgedHost = await app.request('/_cloud/health', {
        headers: { host: 'other.example', 'x-forwarded-host': app.cloud.host },
      });
      assert.equal(forgedHost.status, 421);
      assert.equal(
        (await app.login(app.cloud.ownerKey, 'https://other.example')).status,
        403
      );
      assert.equal((await app.login('x'.repeat(500))).status, 413);
      const invalid = await app.login(key());
      assert.equal(invalid.status, 401);
      assert.equal(invalid.headers['set-cookie'], undefined);
      const valid = await app.login();
      assert.equal(valid.status, 303);
      assert.match(
        valid.headers['set-cookie'][0],
        /^__Host-ms-workspace=[a-f0-9]{64}; Path=\/; HttpOnly; Secure; SameSite=Strict/
      );
      const cookie = session(valid);
      const root = await app.request('/', { headers: { cookie } });
      assert.equal(root.status, 200);
      assert.match(
        root.body,
        /<title>Northwind &amp; &lt;Workspace&gt;<\/title>/
      );
      assert.doesNotMatch(root.body, /discovery-shell/);
      const css = await app.request('/_cloud/brand.css');
      assert.match(css.body, /#067085/);
      const bundle = await app.request('/app.min.js', { headers: { cookie } });
      assert.match(bundle.headers['cache-control'], /no-store/);
      assert.equal(
        (
          await app.request('/links', {
            headers: { cookie, 'sec-fetch-site': 'same-site' },
          })
        ).status,
        403
      );
      const data = JSON.stringify({ id: 'fixture:cloud', tokens: ['fixture'] });
      const put = {
        method: 'PUT',
        body: data,
        headers: { cookie, 'content-type': 'application/json' },
      };
      assert.equal((await app.request('/links', put)).status, 403);
      put.headers.origin = app.cloud.origin;
      assert.equal((await app.request('/links', put)).status, 200);
      const saved = await app.request('/links/fixture:cloud', {
        headers: { cookie },
      });
      assert.equal(JSON.parse(saved.body).id, 'fixture:cloud');
    } finally {
      await app.close();
    }
  }
);

const upgrade = (app, cookie, origin = app.cloud.origin) =>
  new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: app.port,
      path: '/ws',
      headers: {
        host: app.cloud.host,
        origin,
        cookie: cookie ?? '',
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-version': '13',
        'sec-websocket-key': randomBytes(16).toString('base64'),
      },
    });
    req.on('upgrade', (_response, socket) => resolve(socket));
    req.on('response', (res) => {
      res.resume();
      reject(new Error(`Upgrade refused (${res.statusCode})`));
    });
    req.on('error', reject);
    req.end();
  });

test(
  'workspace sessions, links and live channels are isolated and revocable',
  requiresNode,
  async () => {
    const main = await openWorkspace('first.example');
    const other = await openWorkspace('second.example');
    try {
      const firstCookie = session(await main.login());
      const secondCookie = session(await other.login());
      assert.equal((await other.login(main.cloud.ownerKey)).status, 401);
      assert.equal(
        (await other.request('/links', { headers: { cookie: firstCookie } }))
          .status,
        401
      );
      await main.request('/links', {
        method: 'PUT',
        body: JSON.stringify({ id: 'fixture:isolated', tokens: ['fixture'] }),
        headers: {
          cookie: firstCookie,
          origin: main.cloud.origin,
          'content-type': 'application/json',
        },
      });
      assert.equal(
        (
          await other.request('/links/fixture:isolated', {
            headers: { cookie: secondCookie },
          })
        ).status,
        404
      );
      await assert.rejects(upgrade(main));
      await assert.rejects(upgrade(main, firstCookie, other.cloud.origin));
      const socket = await upgrade(main, firstCookie);
      socket.resume();
      const ended = once(socket, 'close');
      const events = await main.open('/api/events', {
        headers: { cookie: firstCookie },
      });
      assert.equal(events.statusCode, 200);
      assert.match(events.headers['cache-control'], /no-store/);
      const eventsClosed = new Promise((resolve) =>
        events.once('close', resolve)
      );
      events.on('error', () => {});
      events.resume();
      const logout = await main.request('/_cloud/sign-out', {
        method: 'POST',
        headers: { cookie: firstCookie, origin: main.cloud.origin },
      });
      assert.equal(logout.status, 303);
      assert.match(logout.headers['set-cookie'][0], /Max-Age=0/);
      await Promise.all([ended, eventsClosed]);
      assert.equal(
        (
          await main.request('/_cloud/session', {
            headers: { cookie: firstCookie },
          })
        ).status,
        401
      );
      assert.equal(
        (
          await other.request('/_cloud/session', {
            headers: { cookie: secondCookie },
          })
        ).status,
        200
      );
    } finally {
      await other.close();
      await main.close();
    }
  }
);
