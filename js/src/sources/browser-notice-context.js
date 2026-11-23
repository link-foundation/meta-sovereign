/* global document */
import { browserFrameVisible } from './browser-choice-document.js';
import { textReplyOpen } from './browser-text-controller.js';

export const noticeVacancyUrl = (link) => {
  let url;
  try {
    url = new URL(link.href);
    if (
      !['https://hh.ru', 'https://www.hh.ru'].includes(url.origin) ||
      url.username ||
      url.password ||
      !/^\/vacancy\/\d{1,30}\/?$/u.test(url.pathname)
    ) {
      return null;
    }
  } catch {
    return null;
  }
  return `${url.origin}${url.pathname}`;
};

export const visibleNoticeElement = (selector) => {
  const nodes = [...document.querySelectorAll(selector)].filter(
    browserFrameVisible
  );
  return nodes.length === 1 ? nodes[0] : null;
};

/** Positive job-chat evidence excludes support and incomplete SPA transitions. */
export const browserVacancyHeader = (spec) => {
  const selectors = spec.noticeContext;
  if (!selectors) {
    return null;
  }
  const company = visibleNoticeElement(selectors.company)?.textContent?.trim();
  const vacancy = visibleNoticeElement(selectors.vacancy)?.textContent?.trim();
  const link = visibleNoticeElement(selectors.link);
  if (
    !company ||
    company.length > 600 ||
    !vacancy ||
    vacancy.length > 600 ||
    !link
  ) {
    return null;
  }
  const vacancyUrl = noticeVacancyUrl(link);
  return vacancyUrl ? { company, vacancy, vacancyUrl } : null;
};

export const browserNoticeContext = (spec) => {
  const header = browserVacancyHeader(spec);
  if (!header) {
    return null;
  }
  const composer = visibleNoticeElement(spec.composer);
  return {
    noticeContext: {
      ...header,
      canReply: Boolean(
        composer &&
        !composer.matches(
          ':disabled,[disabled],[readonly],[aria-disabled="true"],[aria-readonly="true"]'
        ) &&
        !composer.closest('[inert],[aria-disabled="true"]') &&
        textReplyOpen(spec)
      ),
    },
  };
};
