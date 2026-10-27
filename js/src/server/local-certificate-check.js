// Verify our ECDSA certificate using portable crypto primitives. Deno exposes
// X509Certificate but omits verify(), checkPrivateKey() and subjectAltName.
import crypto from 'node:crypto';

const der = (data, start = 0) => {
  const tag = data[start];
  let length = data[start + 1];
  let offset = start + 2;
  if (length & 0x80) {
    const count = length & 0x7f;
    if (!count || count > 4) {
      throw new Error('invalid DER length');
    }
    length = 0;
    for (let n = 0; n < count; n++) {
      length = length * 256 + data[offset++];
    }
  }
  const end = offset + length;
  if (!Number.isInteger(end) || end > data.length) {
    throw new Error('truncated DER');
  }
  return {
    tag,
    end,
    raw: data.subarray(start, end),
    body: data.subarray(offset, end),
  };
};
const children = (data) => {
  const parts = [];
  for (let offset = 0; offset < data.length;) {
    const part = der(data, offset);
    parts.push(part);
    offset = part.end;
  }
  return parts;
};
const SAN_OID = Buffer.from('0603551d11', 'hex');
const ECDSA_SHA256 = Buffer.from('300a06082a8648ce3d040302', 'hex');

export const matchesLocalCertificate = (cert, key, { now, renewMs, san }) => {
  try {
    const x509 = new crypto.X509Certificate(cert);
    if (
      x509.ca ||
      Date.parse(x509.validFrom) > now ||
      Date.parse(x509.validTo) - now <= renewMs
    ) {
      return false;
    }
    const encoded = String(cert).replace(/-----[^-]+-----|\s/g, '');
    const root = der(Buffer.from(encoded, 'base64'));
    const [tbs, algorithm, signature] = children(root.body);
    if (!algorithm.raw.equals(ECDSA_SHA256) || signature.body[0] !== 0) {
      return false;
    }
    const fields = children(tbs.body);
    const extensions = children(
      children(fields.find((field) => field.tag === 0xa3).body)[0].body
    );
    const names = extensions.filter((ext) =>
      children(ext.body)[0].raw.equals(SAN_OID)
    );
    if (names.length !== 1 || !names[0].raw.equals(san)) {
      return false;
    }
    const publicKey = crypto.createPublicKey(crypto.createPrivateKey(key));
    const exportKey = (value) => value.export({ type: 'spki', format: 'der' });
    return (
      exportKey(publicKey).equals(exportKey(x509.publicKey)) &&
      crypto.verify(
        'sha256',
        tbs.raw,
        x509.publicKey,
        signature.body.subarray(1)
      )
    );
  } catch {
    return false;
  }
};
