import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyVacancyDiscovery } from '../../js/tests/helpers/e2e-vacancy-discovery.mjs';
await runBrowserScenarios('vacancy-discovery', [verifyVacancyDiscovery]);
