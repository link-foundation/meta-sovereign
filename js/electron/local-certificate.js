import { X509Certificate } from 'node:crypto';

/** Trust only this owned runtime's certificate on this window's exact origin. */
export const attachLocalCertificate = ({
  app,
  contents,
  origin,
  fingerprint,
}) => {
  if (!fingerprint) {
    throw new Error('Owned desktop TLS certificate fingerprint required.');
  }
  const verify = (event, sender, url, _error, certificate, callback) => {
    let trusted = false;
    try {
      trusted =
        sender === contents &&
        !contents.isDestroyed() &&
        new URL(url).origin === origin &&
        new X509Certificate(certificate.data).fingerprint256 === fingerprint;
    } catch {
      // Malformed URLs or certificates never broaden trust.
    }
    if (trusted) {
      event.preventDefault();
      callback(true);
    }
  };
  app.on('certificate-error', verify);
  return () => app.removeListener('certificate-error', verify);
};
