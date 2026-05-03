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

export declare const runCli: (argv: string[]) => Promise<number>;
export declare const startServer: (opts: {
  port?: number;
  storeDir?: string;
  emailLiveFactory?: (config: unknown) => unknown;
}) => Promise<{ port: number; close: () => Promise<void> }>;
