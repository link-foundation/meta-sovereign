import { questionBrowserProbe } from './question-browser-probe.mjs';
import { verifyVacancyMetadataVariants } from '../../js/tests/helpers/e2e-vacancy-metadata.mjs';

await questionBrowserProbe({}, verifyVacancyMetadataVariants);
