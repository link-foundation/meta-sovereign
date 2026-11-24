import { saveAnswerRule } from '../../js/src/automation/question-store.js';
import { vacancyBrowserFixture } from './vacancy-browser-fixture.mjs';
import { vacancySnapshotFixture } from './vacancy-fixture.mjs';
import { applicationResumeHtml } from './application-resume-html.mjs';

const html = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
const vacancy = vacancySnapshotFixture();
export const applicationNativeHtml = ({
  response = false,
  popup = false,
  resumeChooser = false,
  questionLabel,
  vacancyId = '123',
  salary,
  description = vacancy.description,
  ownerAnswers,
  signedIn = false,
  instantApplication = false,
} = {}) => `<!doctype html><html><body>
    ${signedIn ? '<a data-qa="mainmenu_applicantProfilePage" href="/applicant/resumes">Application fixture account</a>' : ''}
    <h1 data-qa="vacancy-title">${html(vacancy.title)}</h1>
    ${salary === undefined ? '' : `<span data-qa="vacancy-salary">${html(salary)}</span>`}
    <div data-qa="vacancy-description">${html(description)}</div>
    <span data-qa="skills-element">Python</span>
    <label>Header search<input id="header" value="Owner header"></label>
    <button data-qa="vacancy-response-link-top" onclick="openApplication()">Apply</button>
    <div id="application"></div>
    <script>
      globalThis.applicationAttempts=0;
      globalThis.applicationEntries=0;
      globalThis.fixtureAttachmentOpens=0;
      globalThis.fixtureAttachmentSends=0;
      globalThis.fixtureClicks=0;
      document.addEventListener('click',()=>globalThis.fixtureClicks++);
      function openApplication(recordEntry = true) {
        if (recordEntry) globalThis.applicationEntries++;
        document.querySelector('[data-qa="vacancy-response-link-top"]').remove();
        if (${instantApplication}) {
          const root=document.querySelector('#application');
          root.innerHTML='<a data-qa="vacancy-response-link-view-topic">Application delivered</a><button type="button" data-qa="responded-success-attach-cover-letter">Attach cover letter</button>';
          const offer=root.querySelector('button');
          offer.onclick=()=>{
            globalThis.fixtureAttachmentOpens++;
            offer.hidden=true;
            offer.insertAdjacentHTML('afterend','<form aria-label="Separate cover letter"><label>Cover letter<textarea data-qa="vacancy-response-popup-form-letter-input"></textarea></label><button type="submit" data-qa="vacancy-response-letter-submit" disabled>Send letter</button></form>');
            const form=root.querySelector('form');
            form.oninput=()=>{ form.querySelector('button').disabled=!form.querySelector('textarea').value.trim(); };
            form.onsubmit=(event)=>{
              event.preventDefault();
              globalThis.fixtureAttachmentSends++;
              globalThis.fixtureAttachedLetter=form.querySelector('textarea').value;
              form.remove();
              offer.remove();
            };
          };
          return;
        }
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
    description,
    ownerAnswers,
    prepareContext,
    instantApplication,
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
            description,
            signedIn: Boolean(prepareContext),
            instantApplication,
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
                    await session.page.evaluate(
                      (includeAttachment) => ({
                        url: globalThis.location.href,
                        attempts: globalThis.applicationAttempts ?? 0,
                        entries: globalThis.applicationEntries ?? 0,
                        ...(includeAttachment
                          ? {
                              letterOpens:
                                globalThis.fixtureAttachmentOpens ?? 0,
                              letterSends:
                                globalThis.fixtureAttachmentSends ?? 0,
                            }
                          : {}),
                      }),
                      instantApplication
                    )
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
