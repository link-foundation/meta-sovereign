import { assignmentVacancyUrl } from '../assignments/validation.js';
import { resolveOpenBrowserConversation } from '../sources/browser-choice-document.js';
import { readBrowserVacancyHeader } from '../sources/browser-choices.js';
import { HH_WEB_UI } from '../sources/hh-web-ui.js';

const recruiterUi = {
  ...HH_WEB_UI,
  documents: {
    ...HH_WEB_UI.documents,
    ownerOrigins: ['https://hh.ru', 'https://www.hh.ru'],
    frameOrigins: ['https://chatik.hh.ru'],
    ownerPanel: '[data-qa="chatik-root"]',
    chatIdentity: 'html',
  },
};

/** Match the embedded chat's unique visible vacancy link to this delivery. */
export const readApplicationRecruiterPanel = async (
  { commander, page },
  vacancy
) => {
  const document = await resolveOpenBrowserConversation(
    commander,
    page,
    recruiterUi
  );
  const header = await readBrowserVacancyHeader(document, recruiterUi);
  return Boolean(header && assignmentVacancyUrl(header.vacancyUrl) === vacancy);
};
