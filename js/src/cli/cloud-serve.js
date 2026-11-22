import { loadCloudConfig } from '../server/cloud-config.js';
import { startServer } from '../server/index.js';

export const serveCloud = async (args, log) => {
  const storeDir = args.store;
  if (typeof storeDir !== 'string' || !storeDir.trim()) {
    throw new Error(
      'serve-cloud requires an explicit --store=<dir> per workspace'
    );
  }
  const port = Number(args.port ?? process.env.PORT ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('serve-cloud requires a port between 1 and 65535');
  }
  const host = args.listen ?? '127.0.0.1';
  if (host !== '127.0.0.1' && host !== '0.0.0.0') {
    throw new Error('serve-cloud --listen must be 127.0.0.1 or 0.0.0.0');
  }
  const cloud = await loadCloudConfig();
  const handle = await startServer({
    port,
    host,
    storeDir,
    cloud,
    tls: false,
    secretPassphrase: cloud.storeKey,
    log: ({ level, event }) => {
      if (level === 'warn' || level === 'error') {
        log(JSON.stringify({ level, event }));
      }
    },
  });
  log(
    `Cloud workspace ${cloud.origin} is listening behind its TLS proxy on ${host}:${handle.port}`
  );
  await new Promise((resolve) => {
    const stop = () => {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
      resolve();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
  await handle.close();
  return 0;
};
