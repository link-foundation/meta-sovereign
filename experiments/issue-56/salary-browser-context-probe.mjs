import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { questionBrowserServer } from './question-browser-server.mjs';
import { mountSalaryHistory } from './salary-browser-history.mjs';
import { browserAnswerRecent } from '../../js/src/sources/browser-answer-context.js';
import { postQuestion } from '../../js/tests/helpers/question-http.mjs';
import { LINO_TEXT } from '../../js/src/transport/lino.js';
import {
  clarificationSalary as salary,
  salaryNumberQuestion as question,
  salaryAnchor,
} from './salary-clarification-fixture.mjs';

await runBrowserScenarios('salary-context-probe', [
  async (browser) => {
    const fixture = await questionBrowserServer(browser);
    try {
      await fixture.reset({ freeText: true, question });
      await mountSalaryHistory(fixture, [salaryAnchor]);
      const observed = await fixture.send.readAnswerChoices({
        source: 'hh',
        chat: '7',
      });
      console.log(
        JSON.stringify({ observed, recent: browserAnswerRecent(observed) })
      );
      console.log(
        JSON.stringify(
          await postQuestion(
            fixture.base,
            'browser/inspect',
            {
              source: 'hh',
              chat: '7',
              salary,
            },
            LINO_TEXT
          )
        )
      );
    } finally {
      await fixture.close();
    }
  },
]);
