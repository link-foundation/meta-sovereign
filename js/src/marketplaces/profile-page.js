// Runs only on the page the person explicitly chose to save as their profile.
// Reads named profile fields, never cookies, storage, passwords or hidden inputs.
export const captureProfilePage = () => {
  const visible = (node) => {
    if (
      !node?.getClientRects().length ||
      node.closest('[hidden], [aria-hidden="true"]')
    ) {
      return false;
    }
    const style = globalThis.getComputedStyle(node);
    return style.visibility === 'visible' && style.opacity !== '0';
  };
  const text = (selectors) => {
    for (const selector of selectors) {
      const node = globalThis.document.querySelector(selector);
      if (visible(node) && node.type !== 'password') {
        const value = String(node.value ?? node.textContent ?? '').trim();
        if (value) {
          return value;
        }
      }
    }
    return '';
  };
  const nodes = [];
  for (const script of globalThis.document.querySelectorAll(
    'script[type="application/ld+json"]'
  )) {
    try {
      const json = JSON.parse(script.textContent);
      for (const item of Array.isArray(json) ? json : [json]) {
        nodes.push(
          item,
          ...(Array.isArray(item?.['@graph']) ? item['@graph'] : [])
        );
      }
    } catch {
      /* A malformed unrelated script is not profile data. */
    }
  }
  const findPerson = () => {
    const type = (node, wanted) => [node?.['@type']].flat().includes(wanted);
    const page = nodes.find((node) => type(node, 'ProfilePage'));
    return page?.mainEntity && type(page.mainEntity, 'Person')
      ? page.mainEntity
      : nodes.find(
          (node) =>
            type(node, 'Person') &&
            node.url &&
            String(node.url).split(/[?#]/)[0].replace(/\/$/, '') ===
              globalThis.location.href.split(/[?#]/)[0].replace(/\/$/, '')
        );
  };
  const person = findPerson();
  const name =
    person?.name ||
    text([
      '[data-test="profile-name"]',
      '[data-testid="profile-name"]',
      '[data-testid="display-name"]',
      '[data-qa="profile-name"]',
      'main [itemprop="name"]',
      '[itemprop="name"]',
      'input[name="name"]',
      'input[name="fullName"]',
      'input[autocomplete="name"]',
      'input[name="user[name]"]',
      'h1',
    ]);
  const headline =
    person?.jobTitle ||
    text([
      '[data-test="profile-title"]',
      '[data-testid="profile-title"]',
      '[itemprop="jobTitle"]',
      '[data-test="headline"]',
    ]);
  const bio =
    person?.description ||
    text([
      '[data-test="profile-description"]',
      '[data-testid="profile-description"]',
      '[itemprop="description"]',
    ]);
  const skills = [
    ...globalThis.document.querySelectorAll(
      '[data-test="skills"] li, [data-testid="skills"] li, [itemprop="skills"]'
    ),
  ]
    .filter(visible)
    .map((node) => node.textContent.trim());
  // Positive evidence is recorded as an observation, never inferred from a URL.
  const signInObserved = [
    ...globalThis.document.querySelectorAll('a, button'),
  ].some(
    (node) =>
      visible(node) &&
      /^(?:sign out|log out|logout)$/i.test(node.textContent.trim())
  );
  return {
    challenge:
      /just a moment|attention required|access denied|verify.*human|security check/i.test(
        globalThis.document.title
      ) ||
      [
        ...globalThis.document.querySelectorAll(
          '#challenge-running, #cf-challenge-running, #challenge-stage, #px-captcha'
        ),
      ].some(visible),
    url: globalThis.location.href,
    name,
    headline,
    bio,
    skills,
    signInObserved,
  };
};
