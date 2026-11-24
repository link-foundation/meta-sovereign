// Hosted-only real TLS navigation through the production window component.
// Two finite loopback servers and generated fixture certificates; no app data.
import assert from 'node:assert/strict';
import { createServer } from 'node:https';
import { createMainWindow } from '../../js/electron/window.js';
import { makeLocalCertificate } from '../../js/src/server/local-tls.js';
import { certificateFingerprint } from '../../js/src/server/local-key.js';

export const verifyNativeDesktopTls = async ({ app, BrowserWindow }) => {
  const certificates = [makeLocalCertificate(), makeLocalCertificate()];
  const servers = certificates.map((pair) =>
    createServer(pair, (_request, response) => {
      response.setHeader('content-type', 'text/html');
      response.end('<!doctype html><title>Owned TLS fixture</title>');
    })
  );
  let window;
  const before = app.listenerCount('certificate-error');
  let phase = 'listen';
  try {
    for (const server of servers) {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
    }
    const tls = { fingerprint: certificateFingerprint(certificates[0].cert) };
    phase = 'wrong-certificate';
    await assert.rejects(
      createMainWindow({
        app,
        BrowserWindow,
        port: servers[1].address().port,
        tls,
      }),
      /ERR_CERT/
    );
    assert.equal(app.listenerCount('certificate-error'), before);
    phase = 'owned-certificate';
    window = await createMainWindow({
      app,
      BrowserWindow,
      port: servers[0].address().port,
      tls,
    });
    assert.equal(
      await window.webContents.executeJavaScript('document.title'),
      'Owned TLS fixture'
    );
    assert.equal(new URL(window.webContents.getURL()).protocol, 'https:');
    phase = 'foreign-certificate';
    await assert.rejects(
      window.loadURL(`https://127.0.0.1:${servers[1].address().port}/`),
      /ERR_CERT/
    );
    window.destroy();
    assert.equal(app.listenerCount('certificate-error'), before);
    return {
      nativeDesktopTls: true,
      ownedCertificateRequired: true,
      certificateListenerReleased: true,
    };
  } catch (error) {
    throw Object.assign(new Error('Native desktop TLS fixture failed.'), {
      code: `NATIVE_DESKTOP_TLS_${phase}_${error?.name}`,
    });
  } finally {
    if (window && !window.isDestroyed()) {
      window.destroy();
    }
    for (const server of servers) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  }
};
