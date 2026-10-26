/**
 * meta-sovereign — Personal Meta Profile Sovereign system.
 * Top-level type surface. Each subsystem keeps its detailed types
 * inside its own module; this file just enumerates the namespaces.
 */

export * as storage from './storage/index.js';
export * as sources from './sources/index.js';
export * as patterns from './patterns/index.js';
export * as replies from './replies/index.js';
export * as automation from './automation/index.js';
export * as crm from './crm/index.js';
export * as facts from './facts/index.js';
export * as sync from './sync/index.js';
export * as broadcast from './broadcast/index.js';
export * as backup from './storage/backup.js';
export * as handlers from './handlers/index.js';
export * as cv from './cv/index.js';

export declare const runCli: (argv: string[]) => Promise<number>;
export declare const startServer: (opts: {
  port?: number;
  storeDir?: string;
  /** Serve the bundled web UI; defaults to false (GitHub Pages is the UI). */
  localUi?: boolean | string;
  /** Override the default GitHub Pages app URL. */
  uiUrl?: string;
  /** Inject a local system address-book reader; used only after an import request. */
  systemContactsReader?: (storeDir: string) => Promise<unknown[]>;
  emailLiveFactory?: (config: unknown) => unknown;
  /** Periodic pull of a connected mailbox; `false` turns it off. */
  emailPoll?: false | { intervalMs?: number; firstMs?: number };
  cv?: {
    commander?: unknown;
    sessionFactory?: (options?: unknown) => unknown;
    artifactDir?: string | null;
  };
}) => Promise<{ port: number; close: () => Promise<void> }>;
