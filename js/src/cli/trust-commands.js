/**
 * `meta-sovereign trust` (R-Y64).
 *
 * Safari lets the hosted app reach the local server only over https,
 * with a certificate it trusts. `serve` makes that certificate for
 * localhost and 127.0.0.1 only (../server/local-tls.js); this command
 * asks macOS to trust it for TLS, once. macOS shows its own password
 * prompt, so nothing is trusted without the person's consent. On other
 * systems it prints where the certificate is and how to trust it.
 *
 * The runner is injected so the tests never touch a real keychain.
 */

import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

import { loadLocalTls } from '../server/local-tls.js';

export const TRUST_HELP = `  trust         [--store=<dir>] [--remove=true]
                lets Safari use the server from the hosted app: trusts the server's own certificate (localhost and 127.0.0.1 only) once`;

const runCommand = (cmd, args) => {
  const done = spawnSync(cmd, args, { stdio: 'inherit' });
  return done.status ?? 1;
};

/** The `security` call that trusts (or stops trusting) `certPath`. */
export const trustCommandFor = ({ certPath, remove = false, home }) =>
  remove
    ? ['security', ['remove-trusted-cert', certPath]]
    : [
        'security',
        [
          'add-trusted-cert',
          '-r',
          'trustRoot',
          '-p',
          'ssl',
          '-k',
          path.join(home, 'Library/Keychains/login.keychain-db'),
          certPath,
        ],
      ];

const manualSteps = (certPath) =>
  [
    `the server's certificate → ${certPath}`,
    'trust it for websites (TLS) in your system or browser certificate settings,',
    'or in Safari open https://127.0.0.1:8787/trust, click Show Details → visit this website.',
  ].join('\n');

export const createTrustCommands = ({
  run = runCommand,
  platform = process.platform,
  home = os.homedir(),
} = {}) => ({
  trust: async (args, log) => {
    const remove = String(args.remove ?? 'false') !== 'false';
    const { certPath } = await loadLocalTls(args.store ?? '.meta-sovereign');
    if (platform !== 'darwin') {
      log(manualSteps(certPath));
      return 0;
    }
    log(
      remove
        ? `no longer trusting ${certPath}`
        : `trusting ${certPath} for localhost and 127.0.0.1 (macOS asks for your password)`
    );
    const code = run(...trustCommandFor({ certPath, remove, home }));
    if (code !== 0) {
      log(`security exited with ${code}`);
      log(manualSteps(certPath));
      return code;
    }
    log(
      remove
        ? 'done: Safari no longer trusts the server'
        : 'done: reload the app in Safari, it connects to https://127.0.0.1 by itself'
    );
    return 0;
  },
});
