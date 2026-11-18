import { providerChoiceHtml } from './provider-choice-fixture.mjs';

/** HH-shaped native controls at routed official origins; never contacts an account. */
export const hhChoiceHtml = providerChoiceHtml.replace(
  'row.append(p);',
  'row.append(p);if(row.className){const status=document.createElement("span");status.dataset.qa="status-icon-delivered";row.append(status);}'
);
export const hhApplicationHtml = (
  frames = '<iframe src="https://chatik.hh.ru/chat/7"></iframe>'
) =>
  `<!doctype html><html lang="en"><meta charset="utf-8"><title>HH application fixture</title><style>body{font:17px system-ui;background:#edf1f7;color:#20252b;padding:16px}h1{font-size:22px}iframe{width:100%;height:680px;border:1px solid #ccd2dc;background:white;border-radius:12px}</style><nav data-qa="mainmenu_applicantProfile">Applicant profile · isolated fixture</nav><h1>Application · embedded employer conversation</h1>${frames}</html>`;
