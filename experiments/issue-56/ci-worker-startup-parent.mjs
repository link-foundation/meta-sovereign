import { loadPreviousModule } from './previous-module.mjs';

loadPreviousModule('aa890cda', 'js/src/server/worker-client.js');
await import('../../js/tests/worker-client.test.js');
