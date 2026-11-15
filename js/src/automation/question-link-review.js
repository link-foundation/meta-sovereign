import { messageLinkProperties } from '../message-link-targets.js';
import { textLinks } from '../message-links.js';

/** A saved text rule cannot approve a destination hidden behind its label. */
export const questionLinkReview = (question, links) => {
  const properties = messageLinkProperties(links);
  const visible = textLinks(question, { includeFileNames: true });
  return {
    ...properties,
    ...(properties.links?.some((target) => !visible.includes(target))
      ? { requiresReview: true, linkReview: true }
      : {}),
  };
};
