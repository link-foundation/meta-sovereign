// Pure validation shared by stored CV and owner-selected text extraction.
export const publicProfileUrl = (value) => {
  try {
    const url = new URL(value);
    const pathname = decodeURIComponent(url.pathname);
    return ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      !/\/(?:private|invite|joinchat)(?:\/|$)|^\/\+/iu.test(pathname) &&
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      ? url
      : null;
  } catch {
    return null;
  }
};

export const profileUrlKey = (value) => {
  const url = publicProfileUrl(value);
  const host = url?.hostname ?? '';
  if (
    host === 'github.com' ||
    host.endsWith('.github.com') ||
    host === 'github.io' ||
    host.endsWith('.github.io')
  ) {
    return 'github';
  }
  if (/^(?:www\.)?linkedin\.com$/iu.test(host)) {
    return 'linkedin';
  }
  if (/^(?:www\.)?(?:t\.me|telegram\.me)$/iu.test(host)) {
    return 'telegram';
  }
  return /^(?:[a-z0-9-]+\.)?hh\.ru$/iu.test(host) &&
    /^\/resume\/[^/]+\/?$/u.test(url.pathname)
    ? 'resume'
    : null;
};

// Several GitHub profiles in one source form one contact list, with every
// original location retained. Other fields still keep alternative candidates.
export const collectProfileGithub = (add) => {
  const urls = new Map();
  return {
    add: (key, raw, evidence) => {
      if (key !== 'github' || typeof raw !== 'string') {
        add(key, raw, evidence);
        return;
      }
      for (const url of raw.split('\n')) {
        const sources = urls.get(url) ?? [];
        sources.push(evidence);
        urls.set(url, sources);
      }
    },
    finish: () => {
      if (urls.size) {
        const evidence = [
          ...new Map(
            [...urls.values()]
              .flat()
              .map((source) => [JSON.stringify(source), source])
          ).values(),
        ];
        add('github', [...urls.keys()].join('\n'), evidence);
      }
    },
  };
};

const months = [
  ['january', 'января'],
  ['february', 'февраля'],
  ['march', 'марта'],
  ['april', 'апреля'],
  ['may', 'мая'],
  ['june', 'июня'],
  ['july', 'июля'],
  ['august', 'августа'],
  ['september', 'сентября'],
  ['october', 'октября'],
  ['november', 'ноября'],
  ['december', 'декабря'],
];
export const profileBirthDate = (value) => {
  let parts = value.match(/^(\d{4})-(\d{2})-(\d{2})$/u)?.slice(1);
  const dmy = value.match(/^(\d{1,2})[.]\s*(\d{1,2})[.]\s*(\d{4})$/u);
  const named = value
    .toLowerCase()
    .match(/^(\d{1,2})\s+([\p{L}]+)\s+(\d{4})$/u);
  const chinese = value.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/u);
  if (dmy) {
    parts = [dmy[3], dmy[2], dmy[1]];
  }
  if (chinese) {
    parts = chinese.slice(1);
  }
  if (named) {
    const month = months.findIndex((names) => names.includes(named[2])) + 1;
    parts = [named[3], String(month), named[1]];
  }
  if (!parts) {
    return null;
  }
  const iso = parts.map((p, i) => p.padStart(i ? 2 : 4, '0')).join('-');
  const time = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(time) &&
    new Date(time).toISOString().slice(0, 10) === iso
    ? iso
    : null;
};
