import { saveAnswerRule } from '../../js/src/automation/question-store.js';
import { vacancyBrowserFixture } from './vacancy-browser-fixture.mjs';
import { vacancySnapshotFixture } from './vacancy-fixture.mjs';
import { applicationResumeHtml } from './application-resume-html.mjs';

const html = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
export const applicationNativeHtml = ({
  response = false,
  popup = false,
  resumeChooser = false,
  questionLabel,
  vacancyId = '123',
  salary,
  ownerAnswers,
  signedIn = false,
} = {}) => {
  const vacancy = vacancySnapshotFixture();
  return `<!doctype html><html><body>
    ${signedIn ? '<a data-qa="mainmenu_applicantProfilePage" href="/applicant/resumes">Application fixture account</a>' : ''}
    <h1 data-qa="vacancy-title">${html(vacancy.title)}</h1>
    ${salary === undefined ? '' : `<span data-qa="vacancy-salary">${html(salary)}</span>`}
    <div data-qa="vacancy-description">${html(vacancy.description)}</div>
    <span data-qa="skills-element">Python</span>
    <label>Header search<input id="header" value="Owner header"></label>
    <button data-qa="vacancy-response-link-top" onclick="openApplication()">Apply</button>
    <div id="application"></div>
    <script>
      globalThis.applicationAttempts=0;
      globalThis.applicationEntries=0;
      globalThis.fixtureClicks=0;
      document.addEventListener('click',()=>globalThis.fixtureClicks++);
      function openApplication(recordEntry = true) {
        if (recordEntry) globalThis.applicationEntries++;
        document.querySelector('[data-qa="vacancy-response-link-top"]').remove();
        ${popup ? '' : `if (recordEntry) history.pushState({}, '', '/applicant/vacancy_response?vacancyId=${vacancyId}');`}
        document.querySelector('#application').innerHTML='<form id="native-form"><div data-qa="task-body"><label>Recent experience<textarea id="experience"></textarea></label></div><button type="button" data-qa="add-cover-letter" onclick="showLetter(this)">Add letter</button><button type="submit" data-qa="${popup ? 'vacancy-response-submit-popup' : 'vacancy-response-letter-submit'}">Send application</button></form>';
        document.querySelector('#native-form').onsubmit=(event)=>{
          event.preventDefault();
          globalThis.applicationAttempts++;
          globalThis.deliveredLetter=document.querySelector('[data-qa="vacancy-response-form-letter-input"]')?.value;
          document.querySelector('#application').innerHTML='<a data-qa="vacancy-response-link-view-topic">Application delivered</a>';
        };
        ${resumeChooser ? applicationResumeHtml() : ''}
        ${questionLabel ? `document.querySelector('#experience').parentElement.firstChild.textContent=${JSON.stringify(questionLabel)};` : ''}
      }
      function showLetter(button) {
        button.insertAdjacentHTML('beforebegin', '<label>Cover letter<textarea data-qa="vacancy-response-form-letter-input"></textarea></label>');
        button.remove();
      }
      ${response ? 'openApplication(false);' : ''}
      ${
        response && ownerAnswers
          ? `document.querySelector('#experience').value=${JSON.stringify(ownerAnswers.experience)};
      showLetter(document.querySelector('[data-qa="add-cover-letter"]'));
      document.querySelector('[data-qa="vacancy-response-form-letter-input"]').value=${JSON.stringify(ownerAnswers.letter)};`
          : ''
      }
    </script></body></html>`;
};

export const applicationNativeFixture = async (
  browser,
  {
    application,
    popup = false,
    resumeChooser = false,
    questionLabel,
    store,
    artifactRoot,
    vacancyIds = ['123'],
    onApplicationClose,
    salary,
    ownerAnswers,
    prepareContext,
  } = {}
) => {
  let nativeForms = 0;
  const fixture = await vacancyBrowserFixture(browser, {
    ...(store ? { store } : {}),
    exports: {
      prepare: prepareContext,
      route: async (route) => {
        const url = new URL(route.request().url());
        const response =
          url.pathname === '/applicant/vacancy_response' &&
          url.searchParams.getAll('vacancyId').length === 1 &&
          vacancyIds.includes(url.searchParams.get('vacancyId'));
        if (
          url.origin !== 'https://hh.ru' ||
          (!vacancyIds.some((id) => url.pathname === `/vacancy/${id}`) &&
            !response)
        ) {
          return false;
        }
        await route.fulfill({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          body: applicationNativeHtml({
            response,
            popup,
            resumeChooser,
            questionLabel,
            signedIn: Boolean(prepareContext),
            salary:
              typeof salary === 'function'
                ? salary(
                    response
                      ? url.searchParams.get('vacancyId')
                      : url.pathname.split('/').at(-1)
                  )
                : salary,
            ownerAnswers:
              response && ++nativeForms === 1 ? ownerAnswers : undefined,
            vacancyId: response
              ? url.searchParams.get('vacancyId')
              : url.pathname.split('/').at(-1),
          }),
        });
        return true;
      },
      service: ({ openSession }) => ({
        application: onApplicationClose
          ? {
              ...application,
              openSession: async (input) => {
                const session = await openSession(input);
                const close = session.close;
                session.close = async () => {
                  await onApplicationClose(
                    await session.page.evaluate(() => ({
                      url: globalThis.location.href,
                      attempts: globalThis.applicationAttempts ?? 0,
                      entries: globalThis.applicationEntries ?? 0,
                    }))
                  );
                  await close();
                };
                return session;
              },
            }
          : application,
        ...(artifactRoot ? { artifactRoot } : {}),
      }),
    },
  });
  await saveAnswerRule(fixture.store, {
    id: 'application-experience',
    question: 'Recent experience',
    source: 'hh',
    answers: [
      {
        text: 'Five years building Python services.',
        approved: true,
        count: 2,
        evidence: ['synthetic-owner-answer'],
      },
    ],
  });
  return fixture;
};
