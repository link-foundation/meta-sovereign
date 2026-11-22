import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../../src/server/index.js';
import { makeLocalCertificate } from '../../src/server/local-tls.js';

export const WORKSPACE_BRAND = 'Northwind Workspace';
const logo = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAcklEQVR4nGNgQAJsBa3/qYEZ0AG1DMZpEU0toJXhcEsGzIJf//+DMSEDCKkbeAsIWUIVC/AZQDULcBlClTjAZwnVIhmXJVRNRdgsoXoyRbeEJvmA2ARAtgWkJGOKcjLNLaBZHFDFAmph2lsw9OtkWjdbAKgq6kV6Ss9GAAAAAElFTkSuQmCC',
  'base64'
);

export const startWorkspaceFixture = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-cloud-browser-'));
  let handle;
  const proxy = https.createServer(makeLocalCertificate(), (req, res) => {
    const upstream = http.request(
      {
        hostname: '127.0.0.1',
        port: handle.port,
        path: req.url,
        method: req.method,
        headers: req.headers,
      },
      (answer) => {
        res.writeHead(answer.statusCode, answer.headers);
        answer.pipe(res);
        res.on('close', () => answer.destroy());
      }
    );
    upstream.on('error', () => res.destroy());
    req.pipe(upstream);
  });
  proxy.listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  const host = `127.0.0.1:${proxy.address().port}`;
  const origin = `https://${host}`;
  const ownerKey = randomBytes(32).toString('hex');
  const storeKey = randomBytes(32).toString('hex');
  try {
    handle = await startServer({
      port: 0,
      tls: false,
      cloud: {
        origin,
        host,
        ownerKey,
        storeKey,
        brand: { name: WORKSPACE_BRAND, accent: '#067085', logo },
      },
      storeDir: dir,
      secretPassphrase: storeKey,
      telegramAccount: false,
      emailPoll: false,
      enableHandlers: false,
      backups: { enabled: false },
      automations: { scheduler: false },
      log: null,
    });
  } catch (error) {
    proxy.close();
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
  return {
    origin,
    ownerKey,
    async close() {
      proxy.close();
      proxy.closeAllConnections();
      await handle.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
};
