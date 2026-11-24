import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import {
  verifyDiscoveryBatchHandoff,
  verifyFilteredVacancyDiscovery,
  verifyMemoryVacancyDiscovery,
} from './helpers/e2e-vacancy-discovery.mjs';
import { verifySalaryLadder } from './helpers/e2e-salary-ladder.mjs';

await runBrowserScenarios('vacancy-discovery', [
  verifyDiscoveryBatchHandoff,
  verifyFilteredVacancyDiscovery,
  verifyMemoryVacancyDiscovery,
  verifySalaryLadder,
]);
