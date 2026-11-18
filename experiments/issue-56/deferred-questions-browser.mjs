import { questionBrowserProbe } from './question-browser-probe.mjs';
import { verifyDeferredQuestions } from '../../js/tests/helpers/e2e-deferred-questions.mjs';

await questionBrowserProbe(
  { screenshots: 'docs/screenshots/issue-56-deferred-questions' },
  verifyDeferredQuestions
);
