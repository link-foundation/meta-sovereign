import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const domainPattern =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const slugPattern = /^[a-z0-9][a-z0-9-]{0,47}$/;
const quote = (value) => `'${value.replaceAll("'", "\\'")}'`;
const key = () => `${randomBytes(32).toString('hex')}\n`;

const writePrivate = (file, value, mode = 0o600) =>
  writeFile(file, value, { encoding: 'utf8', mode, flag: 'wx' });

const initialize = async (dir, host, port) => {
  const destination = path.resolve(dir);
  const slug = path.basename(destination);
  if (!slugPattern.test(slug) || /[\r\n]/.test(destination)) {
    throw new Error(
      'Use a directory named for a workspace ID with lowercase letters, numbers and hyphens'
    );
  }
  if (!domainPattern.test(host)) {
    throw new Error(
      'Use a DNS name such as acme.example.com for the workspace'
    );
  }
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1024 || Number(port) > 65535) {
    throw new Error('Use a unique host port between 1024 and 65535');
  }
  await mkdir(destination, { mode: 0o700 });
  const secrets = path.join(destination, 'secrets');
  await mkdir(secrets, { mode: 0o755 });
  // Bind-mounted keys must be readable by the container's unprivileged UID.
  // On the host, the parent directories grant access only to the operator.
  await writePrivate(path.join(secrets, 'owner.key'), key(), 0o444);
  await writePrivate(path.join(secrets, 'store.key'), key(), 0o444);
  await writePrivate(
    path.join(destination, 'workspace.env'),
    [
      `COMPOSE_PROJECT_NAME=ms-${slug}`,
      `MS_CLOUD_CONFIG_DIR=${quote(destination)}`,
      `MS_CLOUD_ORIGIN=https://${host}`,
      `MS_CLOUD_PORT=${Number(port)}`,
      'MS_CLOUD_BRAND_NAME=meta-sovereign',
      'MS_CLOUD_BRAND_ACCENT=',
      'MS_CLOUD_BRAND_LOGO_FILE=',
      '',
    ].join('\n')
  );
  await writePrivate(
    path.join(destination, 'workspace.caddy'),
    `${host} {\n\treverse_proxy 127.0.0.1:${Number(port)}\n}\n`
  );
  return destination;
};

const [dir, host, port] = process.argv.slice(2);
if (!dir || !host || !port) {
  console.error(
    'Usage: node docker/init-workspace.mjs <new-config-directory> <domain> <private-port>'
  );
  process.exitCode = 1;
} else {
  try {
    const destination = await initialize(dir, host, port);
    console.log(`Workspace configuration created in ${destination}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
