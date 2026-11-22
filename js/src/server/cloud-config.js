import { promises as fs } from 'node:fs';

const APP_NAME = 'meta-sovereign';
const PNG_HEADER = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const publicOrigin = (value) => {
  const url = URL.parse(value ?? '');
  if (
    url?.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.href !== `${url.origin}/`
  ) {
    throw new Error('MS_CLOUD_ORIGIN must be a bare HTTPS origin');
  }
  return url;
};

const randomSecret = async (file, label) => {
  if (!file) {
    throw new Error(`${label} is required`);
  }
  const secret = (await fs.readFile(file, 'utf8')).trim();
  if (!/^[a-f0-9]{64}$/.test(secret)) {
    throw new Error(
      `${label} must contain 32 random bytes encoded as lowercase hex`
    );
  }
  return secret;
};

const readLogo = async (file) => {
  if (!file) {
    return null;
  }
  const handle = await fs.open(file, 'r');
  try {
    const bytes = Buffer.alloc(256 * 1024 + 1);
    const { bytesRead } = await handle.read(bytes);
    if (
      bytesRead === bytes.length ||
      !bytes.subarray(0, PNG_HEADER.length).equals(PNG_HEADER)
    ) {
      throw new Error('MS_CLOUD_BRAND_LOGO_FILE must be a PNG up to 256 KiB');
    }
    return bytes.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
};

export const loadCloudConfig = async (env = process.env) => {
  const url = publicOrigin(env.MS_CLOUD_ORIGIN);
  const name = env.MS_CLOUD_BRAND_NAME?.trim() || APP_NAME;
  if (name.length > 64 || /\p{Cc}/u.test(name)) {
    throw new Error(
      'MS_CLOUD_BRAND_NAME must be plain text of up to 64 characters'
    );
  }
  const accent = env.MS_CLOUD_BRAND_ACCENT || null;
  if (accent && !/^#[a-f0-9]{6}$/i.test(accent)) {
    throw new Error('MS_CLOUD_BRAND_ACCENT must be a six-digit hex color');
  }
  const ownerKey = await randomSecret(
    env.MS_CLOUD_OWNER_KEY_FILE,
    'MS_CLOUD_OWNER_KEY_FILE'
  );
  const storeKey = await randomSecret(
    env.MS_CLOUD_STORE_KEY_FILE,
    'MS_CLOUD_STORE_KEY_FILE'
  );
  if (ownerKey === storeKey) {
    throw new Error('Generate separate cloud owner and store keys');
  }
  const logo = await readLogo(env.MS_CLOUD_BRAND_LOGO_FILE);
  return {
    origin: url.origin,
    host: url.host,
    ownerKey,
    storeKey,
    brand: { name, accent, logo },
  };
};
