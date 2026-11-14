import {
  confirmedTechnologyAnalysis,
  confirmedTechnologyCatalog,
} from '../jobs/technology-result.js';
import { technologyFailure } from '../jobs/technology-catalog.js';

/** Saving/analysis require server acknowledgement; cached reports are read-only offline. */
export const createTechnologyApi = ({ get, report, local }) => ({
  vacancyTechnologyCatalog: async () => {
    const value = await get('/api/vacancies/technology-catalog');
    if (!value) {
      throw technologyFailure('server');
    }
    return confirmedTechnologyCatalog(value);
  },
  vacancyTechnologyCatalogSave: async (input) => {
    const value = await report(
      '/api/vacancies/technology-catalog-save',
      input,
      { network: true, read: false }
    );
    return confirmedTechnologyCatalog(value, input);
  },
  vacancyTechnologyAnalyze: async (input) => {
    const value = await report('/api/vacancies/technology-analyze', input, {
      network: true,
      read: false,
    });
    if (!value?.analysis) {
      throw technologyFailure('unconfirmed');
    }
    return confirmedTechnologyAnalysis(value, input);
  },
  vacancyTechnologyAnalysisStored: async ({ browserSlot }) => {
    const value = await get(
      `/api/vacancies/technology-analysis-stored?${new URLSearchParams({ browserSlot })}`
    );
    const saved = value ?? {
      analysis:
        (await (await local()).get(`jobs-technology-analysis:${browserSlot}`))
          ?.analysis ?? null,
    };
    const confirmed = await confirmedTechnologyAnalysis(saved);
    if (
      confirmed.analysis &&
      confirmed.analysis.resume.browserSlot !== browserSlot
    ) {
      throw technologyFailure('unconfirmed');
    }
    return confirmed;
  },
});
