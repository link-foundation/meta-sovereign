const googleRespondent =
  /^\/(?:a\/[a-z\d.-]+\/)?forms\/(?:u\/\d+\/)?d\/((?:e\/)?[\w-]+)\/viewform\/?$/u;
const yandexRespondent = /^\/((?:cloud\/)?u\/[\w-]+)\/?$/u;
const typeformRespondent = /^\/to\/([\w-]+)\/?$/u;
const shortMicrosoft = /^\/r\/([\w-]+)\/?$/iu;
const microsoftHosts = new Set(['forms.office.com', 'forms.cloud.microsoft']);

const shapeOf = ({ hostname, pathname, searchParams }) => {
  if (hostname === 'forms.gle' && /^\/[\w-]+\/?$/u.test(pathname)) {
    return { provider: 'google', short: true };
  }
  if (hostname === 'docs.google.com') {
    return { provider: 'google', id: googleRespondent.exec(pathname)?.[1] };
  }
  if (['forms.yandex.ru', 'forms.yandex.com'].includes(hostname)) {
    return { provider: 'yandex', id: yandexRespondent.exec(pathname)?.[1] };
  }
  if (microsoftHosts.has(hostname)) {
    if (shortMicrosoft.test(pathname)) {
      return { provider: 'microsoft', short: true };
    }
    if (pathname.toLowerCase() === '/pages/responsepage.aspx') {
      const id = [...searchParams].filter(
        ([key]) => key.toLowerCase() === 'id'
      );
      return { provider: 'microsoft', id: id.length === 1 && id[0][1] };
    }
  }
  return /^[a-z\d-]+\.typeform\.com$/u.test(hostname)
    ? { provider: 'typeform', id: typeformRespondent.exec(pathname)?.[1] }
    : {};
};

/** Only respondent destinations from the documented form providers. */
export const respondentDestination = (value) => {
  if (
    typeof value !== 'string' ||
    value.length > 2000 ||
    !/^https:\/\//iu.test(value)
  ) {
    return null;
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (
    parsed.username ||
    parsed.password ||
    parsed.port ||
    /[\s\\]/u.test(value)
  ) {
    return null;
  }
  const shape = shapeOf(parsed);
  return shape.short || shape.id
    ? { ...shape, url: parsed.href, origin: parsed.origin }
    : null;
};

export const sameRespondentForm = (target, resolved) =>
  Boolean(
    resolved &&
    (!resolved.short ||
      (resolved.provider === 'microsoft' && resolved.url === target.url)) &&
    target.provider === resolved.provider &&
    (target.short ||
      (target.id === resolved.id &&
        (target.provider !== 'typeform' || target.origin === resolved.origin)))
  );
