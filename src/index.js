/**
 * meta-sovereign — Personal Meta Profile Sovereign system.
 *
 * Public entry point. The library is organised by subsystem; each
 * sub-export is also published as its own NPM-importable path so
 * downstream apps can depend on just the slice they need (R-F1).
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

export { runCli } from './cli/index.js';
export { startServer } from './server/index.js';
