// Opens a store folder (argv[2]) with a migration that kills the process
// half way (R-Z17): the journal is left behind for the next open.
import { openDualStore } from '../../src/storage/dual-store.js';
import { stoppingMigration } from './test-migrations.mjs';

await openDualStore(process.argv[2], {
  migrations: [stoppingMigration(2, 'exit')],
  current: 1,
});
