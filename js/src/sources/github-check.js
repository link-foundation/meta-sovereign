/**
 * Whether a GitHub account someone sent us is theirs (R-Y53): its public
 * profile is read once — `GET api.github.com/users/<login>` and its
 * `social_accounts` — kept in the store as `github-check:<login>` and
 * read again only after a week. Each login is asked about once at a
 * time; a rate limit is waited out, never retried in a loop.
 *
 *   confirmed — the profile links back to the person (their Telegram
 *               username in the profile's links, blog or bio);
 *   name      — the profile's name is the person's name;
 *   shared    — they sent it, nothing on it points back;
 *   missing   — no such account;
 *   unknown   — GitHub could not be asked (offline, rate limit).
 *
 * Only public data of a login the person sent is read; no token is sent.
 */

const API = 'https://api.github.com';
const FRESH_MS = 7 * 24 * 60 * 60_000;
const LOGIN = /^[A-Za-z\d](?:[A-Za-z\d-]{0,38})$/;

export const githubCheckId = (login) =>
  `github-check:${String(login).toLowerCase()}`;

const fold = (text) =>
  String(text ?? '')
    .toLocaleLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

// The words of a profile that may point back to the person.
const profileText = ({ user, socials }) =>
  [
    user?.blog,
    user?.bio,
    user?.twitter_username,
    ...(socials ?? []).map((s) => s?.url),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();

const linksTelegram = (text, username) => {
  const name = String(username ?? '')
    .replace(/^@/u, '')
    .toLowerCase();
  if (!name) {
    return false;
  }
  return new RegExp(
    `(?:t\\.me/|telegram\\.me/|@)${name.replace(/[^\w]/gu, '')}(?![\\w])`,
    'u'
  ).test(text);
};

/**
 * What a kept check says about the person: `{ status, via?, login,
 * name, url, avatar, repos, since }`. `person`: `{ username, name }`
 * (their Telegram username and display name).
 */
export const githubVerdict = (record, person = {}) => {
  if (!record || record.status === 'unknown') {
    return { status: 'unknown' };
  }
  if (record.status === 'missing') {
    return { status: 'missing', login: record.login };
  }
  const { user } = record;
  const about = {
    login: user.login,
    name: user.name ?? null,
    url: user.html_url ?? `https://github.com/${user.login}`,
    avatar: user.avatar_url ?? null,
    repos: user.public_repos ?? null,
    since: user.created_at ?? null,
  };
  if (linksTelegram(profileText(record), person.username)) {
    return { ...about, status: 'confirmed', via: 'telegram' };
  }
  if (person.name && user.name && fold(person.name) === fold(user.name)) {
    return { ...about, status: 'name' };
  }
  return { ...about, status: 'shared' };
};

// The few fields kept of a profile.
const keptUser = (user) => ({
  login: user.login,
  name: user.name ?? null,
  blog: user.blog ?? null,
  bio: user.bio ?? null,
  twitter_username: user.twitter_username ?? null,
  html_url: user.html_url ?? null,
  avatar_url: user.avatar_url ?? null,
  public_repos: user.public_repos ?? null,
  created_at: user.created_at ?? null,
});

const checkLink = (login, fields, at) => ({
  id: githubCheckId(login),
  tokens: ['github-check', String(login).toLowerCase()],
  kind: 'github-check',
  login,
  at: new Date(at).toISOString(),
  ...fields,
});

/**
 * `check(login, person)` → the verdict, from the store when fresh,
 * else from GitHub. `fetch` is injectable so tests never reach GitHub.
 */
export const createGitHubCheck = ({
  store,
  fetch: fetchOf = globalThis.fetch,
  now = Date.now,
  log = () => {},
}) => {
  let blockedUntil = 0;
  const inFlight = new Map();

  const get = (path) =>
    fetchOf(`${API}${path}`, {
      headers: {
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
      },
    });

  const ask = async (login) => {
    const started = now();
    const res = await get(`/users/${encodeURIComponent(login)}`);
    if (res.status === 404) {
      log({
        event: 'github_check',
        found: false,
        duration_ms: now() - started,
      });
      return { status: 'missing' };
    }
    if (!res.ok) {
      const reset = Number(res.headers?.get?.('x-ratelimit-reset')) * 1000;
      blockedUntil =
        Number.isFinite(reset) && reset > 0 ? reset : now() + 3_600_000;
      log({ level: 'warn', event: 'github_check_failed', status: res.status });
      return null;
    }
    const user = keptUser(await res.json());
    const social = await get(
      `/users/${encodeURIComponent(login)}/social_accounts`
    );
    const socials = social.ok
      ? ((await social.json()) ?? []).map((s) => ({
          provider: s?.provider ?? null,
          url: s?.url ?? null,
        }))
      : [];
    log({
      event: 'github_check',
      found: true,
      socials: socials.length,
      duration_ms: now() - started,
    });
    return { status: 'found', user, socials };
  };

  const refresh = async (login) => {
    if (now() < blockedUntil) {
      return null;
    }
    const fields = await ask(login).catch((error) => {
      log({
        level: 'warn',
        event: 'github_check_failed',
        code: error?.code ?? null,
      });
      return null;
    });
    if (!fields) {
      return null;
    }
    const link = checkLink(login, fields, now());
    await store.put(link);
    return link;
  };

  const check = async (login, person = {}) => {
    if (!LOGIN.test(String(login ?? ''))) {
      return { status: 'unknown' };
    }
    const kept = await store.get(githubCheckId(login));
    if (kept && now() - (Date.parse(kept.at) || 0) < FRESH_MS) {
      return githubVerdict(kept, person);
    }
    const key = githubCheckId(login);
    if (!inFlight.has(key)) {
      inFlight.set(
        key,
        refresh(login).finally(() => inFlight.delete(key))
      );
    }
    return githubVerdict((await inFlight.get(key)) ?? kept, person);
  };

  return { check };
};
