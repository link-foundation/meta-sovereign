import { recoveryFormats } from '../storage/recovery-dump.js';

// What `serve` passes to the server besides its port, store and log.
export const serveOptions = (args, { defaultTls = true } = {}) => ({
  ...(args.verbose !== undefined ? { verbose: args.verbose } : {}),
  backups: {
    ...(args['backup-interval-hours'] !== undefined
      ? { intervalHours: Number(args['backup-interval-hours']) }
      : {}),
    ...(args['backup-keep'] !== undefined
      ? { keep: Number(args['backup-keep']) }
      : {}),
    ...(args['recovery-formats'] !== undefined
      ? {
          formats:
            args['recovery-formats'] === 'none'
              ? []
              : recoveryFormats(args['recovery-formats']),
        }
      : {}),
  },
  // Hosted web origins allowed to use this server (issue #37); falls
  // back to MS_ALLOW_ORIGINS and then the built-in defaults.
  ...(args['allow-origin'] ? { allowOrigins: args['allow-origin'] } : {}),
  // The hosted app is the UI; the server's own copy is a fallback
  // enabled with `--local-ui=true` (R-Y58, R-Y59).
  ...(args['ui-url'] ? { uiUrl: args['ui-url'] } : {}),
  ...(args['local-ui'] !== undefined ? { localUi: args['local-ui'] } : {}),
  ...(args['json-compatibility'] !== undefined
    ? { jsonCompatibility: String(args['json-compatibility']) === 'true' }
    : {}),
  // https beside http on the same port, for Safari (R-Y64).
  tls:
    String(args.tls ?? defaultTls) !== 'false' && process.env.MS_TLS !== 'off',
});
