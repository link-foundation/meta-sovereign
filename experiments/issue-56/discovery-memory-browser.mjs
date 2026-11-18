import { questionBrowserProbe } from './question-browser-probe.mjs';
import { verifyVacancyDiscovery } from '../../js/tests/helpers/e2e-vacancy-discovery.mjs';

await questionBrowserProbe({}, (browser) =>
  verifyVacancyDiscovery(browser, { memoryOnly: true })
);
