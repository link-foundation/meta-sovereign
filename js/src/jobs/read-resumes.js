import { readAssignmentPage } from '../assignments/read-page.js';
import { HH_RESUMES_URL, resumeList } from './resume-list.js';

export const readResumeListDocument = () => {
  const { document, location } = globalThis;
  const visible = (node) => Boolean(node?.getClientRects().length);
  const challenge = [
    ...document.querySelectorAll(
      '[data-qa="captcha"], iframe[src*="captcha"], input[name="captcha"]'
    ),
  ].some(visible);
  const readState = () => {
    const templates = [
      ...document.querySelectorAll('template.ResumeProfileFront-InitialState'),
    ];
    let state;
    try {
      const text = templates[0]?.content.textContent;
      if (templates.length === 1 && text?.length <= 500000) {
        state = JSON.parse(text);
      }
    } catch {
      // Visible cards remain usable when optional dates cannot be decoded.
    }
    return state;
  };
  const state = readState();
  const listed = [...document.querySelectorAll('[data-qa="resume"]')].filter(
    visible
  );
  const native = Array.isArray(state?.applicantResumes)
    ? state.applicantResumes
    : null;
  const metadata = native?.slice(0, 101).map((row) => {
    const attributes = row?._attributes ?? {};
    const time = Number(attributes.updated ?? attributes.lastEditTime);
    return {
      hash: attributes.hash,
      title: [row?.title ?? []]
        .flat()
        .map((part) => part?.string ?? '')
        .join('')
        .trim(),
      updatedAt: Number.isFinite(time) && time > 0 ? time : null,
      latest: attributes.hash === state.latestResumeHash,
      updatedText: '',
    };
  });
  const entries = listed.length
    ? listed.slice(0, 101).map((block) => {
        const readIdentity = () => {
          const links = [
            ...block.querySelectorAll('a[data-qa^="resume-card-link-"]'),
          ].filter(visible);
          const link = links[0];
          const hash =
            links.length === 1
              ? link.getAttribute('data-qa').slice('resume-card-link-'.length)
              : null;
          const expected = hash ? `https://hh.ru/resume/${hash}` : null;
          const url = link ? new URL(link.href) : null;
          const identity =
            url?.origin === 'https://hh.ru' &&
            `${url.origin}${url.pathname}` === expected;
          return { hash: identity ? hash : null, link };
        };
        const { hash, link } = readIdentity();
        const matches = metadata?.filter((row) => row.hash === hash) ?? [];
        return {
          hash: matches.length <= 1 ? hash : null,
          title:
            block.getAttribute('data-qa-title') || link?.innerText.trim() || '',
          updatedAt: matches[0]?.updatedAt ?? null,
          latest: matches[0]?.latest ?? false,
          updatedText:
            block.innerText.match(
              /(?:обновлен[оа]?|updated)\s[^\n·•]{0,100}/iu
            )?.[0] ?? '',
        };
      })
    : (metadata ?? []);
  const consistent =
    !native ||
    !listed.length ||
    (native.length === entries.length &&
      metadata.every((row) => entries.some((item) => item.hash === row.hash)));
  return {
    url: location.href,
    entries,
    observed: consistent && (listed.length > 0 || native !== null),
    challenge,
    capturedAt: new Date().toISOString(),
  };
};

export const createResumeListReader =
  ({ store, openSession }) =>
  (options) =>
    readAssignmentPage({
      store,
      openSession,
      signal: options.signal,
      platform: 'hh',
      slot: options.browserSlot,
      useCase: 'jobs',
      browserOptions:
        options.headless === undefined ? {} : { headless: options.headless },
      kind: 'resumes',
      url: HH_RESUMES_URL,
      read: readResumeListDocument,
      validate: (raw) => resumeList(raw, options.browserSlot),
    });
