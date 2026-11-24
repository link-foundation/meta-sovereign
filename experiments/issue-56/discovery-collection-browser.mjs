import { questionBrowserProbe } from './question-browser-probe.mjs';
import { loadPreviousModule } from './previous-module.mjs';

if (process.env.DISCOVERY_COLLECTION_PARENT === '1') {
  loadPreviousModule('9da8b847', 'js/src/jobs/discovery.js');
}
const { verifyFilteredVacancyDiscovery } =
  await import('../../js/tests/helpers/e2e-vacancy-discovery.mjs');
await questionBrowserProbe({}, verifyFilteredVacancyDiscovery);
