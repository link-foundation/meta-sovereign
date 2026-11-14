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

/** Positive job-chat evidence excludes support and incomplete SPA transitions. */
export const browserNoticeContext = (spec) => {
  const selectors = spec.noticeContext;
  if (!selectors) {
    return null;
  }
  const one = (selector) => {
    const nodes = [...document.querySelectorAll(selector)].filter(
      browserFrameVisible
    );
    return nodes.length === 1 ? nodes[0] : null;
  };
  const company = one(selectors.company)?.textContent?.trim();
  const vacancy = one(selectors.vacancy)?.textContent?.trim();
  const link = one(selectors.link);
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
  if (!vacancyUrl) {
    return null;
  }
  const composer = one(spec.composer);
  return {
    noticeContext: {
      company,
      vacancy,
      vacancyUrl,
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
