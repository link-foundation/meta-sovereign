// Newbie-friendly connection guides for every nav surface (issue #10).
//
// `connectionGuides` maps each navigation surface to the providers that
// fill it, the archive-import paths, and the live-API credential paths.
// `tryDirect()` issues a browser `fetch()` to a provider URL and
// classifies the failure as a probable CORS error when the request
// throws before producing a response. The React `<ConnectionGuide />`
// and `<LocalServerHelp />` components in ./connection-guide.jsx render
// the registry into the empty branches of the views.
//
// Rationale and references: see docs/case-studies/issue-10/.

import { saveServerOverride } from './discover.js';

// Provider catalogue. One entry per `MessageSource` adapter in
// js/src/sources/. Each entry inlines the install paragraph (R-M3) and
// the API-credential path (R-M4) so the user does not need to leave the
// SPA (R-M7).
export const providerCatalogue = {
  email: {
    label: 'Email',
    archive: {
      title: 'Import .eml or mbox mail exports',
      hint: 'Export mail from your provider as .eml files or an mbox archive, including Gmail Takeout mbox files. Drop the file into the import box with source "email".',
      fileHint: '*.eml, *.mbox',
    },
    apiCredentials: {
      title: 'Connect email APIs and protocols',
      envVar: 'EMAIL_ACCESS_TOKEN',
      hint: 'Use JMAP, Gmail API, or Microsoft Graph directly from the browser when CORS allows it. IMAP, POP3, and SMTP require the local server because browsers cannot open raw TCP/TLS mail sockets.',
      docsUrl: 'https://jmap.io/spec/',
      apiBase: 'https://gmail.googleapis.com',
      probeUrl: 'https://gmail.googleapis.com/gmail/v1/users/me/profile',
    },
  },
  telegram: {
    label: 'Telegram',
    archive: {
      title: 'Import a Telegram Desktop archive',
      hint: 'Telegram Desktop -> Settings -> Advanced -> Export Telegram data. Pick "Personal chats" + "JSON" and drop the resulting "result.json" into the import box below.',
      fileHint: 'result.json',
    },
    apiCredentials: {
      title: 'Connect the Telegram Bot API',
      envVar: 'TELEGRAM_BOT_TOKEN',
      hint: 'Talk to @BotFather inside Telegram, run /newbot, copy the bot token and paste it as the secret named "secret:telegram:bot-token".',
      docsUrl: 'https://core.telegram.org/bots#how-do-i-create-a-bot',
      apiBase: 'https://api.telegram.org',
      probeUrl: 'https://api.telegram.org/bot/getMe',
    },
  },
  vk: {
    label: 'VK',
    archive: {
      title: 'Import a VK conversations archive',
      hint: 'Open https://vk.com/data_protection, request your archive, unzip it and load the "messages" JSON files.',
      fileHint: 'messages*.json',
    },
    apiCredentials: {
      title: 'Connect the VK API',
      envVar: 'VK_ACCESS_TOKEN',
      hint: 'Create a Standalone application at https://vk.com/apps?act=manage and request an access token with the messages scope. Paste it as "secret:vk:token".',
      docsUrl: 'https://dev.vk.com/api/access-token/getting-started',
      apiBase: 'https://api.vk.com',
      probeUrl: 'https://api.vk.com/method/users.get?v=5.199',
    },
  },
  x: {
    label: 'X (Twitter)',
    archive: {
      title: 'Import an X data archive',
      hint: 'Settings -> Your account -> Download an archive of your data. Once the archive is ready, unzip it and select the JSON files under data/ for tweets and direct messages.',
      fileHint: 'tweets.js, direct-messages.js',
    },
    apiCredentials: {
      title: 'Connect the X API v2',
      envVar: 'X_ACCESS_TOKEN',
      hint: 'Create an app at https://developer.x.com/, generate a user-context bearer token, and paste it as "secret:x:token".',
      docsUrl: 'https://developer.x.com/en/docs/authentication/oauth-2-0',
      apiBase: 'https://api.x.com',
      probeUrl: 'https://api.x.com/2/users/me',
    },
  },
  whatsapp: {
    label: 'WhatsApp',
    archive: {
      title: 'Import a WhatsApp chat export',
      hint: 'In the WhatsApp app, open a chat -> ... -> More -> Export chat (no media). Drop the resulting "WhatsApp Chat with NAME.txt" into the import box.',
      fileHint: 'WhatsApp Chat with *.txt',
    },
    apiCredentials: {
      title: 'Connect the WhatsApp Cloud API',
      envVar: 'WHATSAPP_ACCESS_TOKEN',
      hint: 'Create a Meta for Developers app, add the WhatsApp product, copy the temporary or system-user access token and the phone number id (WHATSAPP_PHONE_NUMBER_ID).',
      docsUrl:
        'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started',
      apiBase: 'https://graph.facebook.com',
      probeUrl: 'https://graph.facebook.com/v22.0/me',
    },
  },
  facebook: {
    label: 'Facebook',
    archive: {
      title: 'Import a Facebook download',
      hint: 'Settings & privacy -> Settings -> Your information -> Download your information. Choose "JSON" and select the categories you need (messages, posts).',
      fileHint: 'messages_*.json, posts_*.json',
    },
    apiCredentials: {
      title: 'Connect the Facebook Graph API',
      envVar: 'FACEBOOK_PAGE_ACCESS_TOKEN',
      hint: 'In your Meta for Developers app, add a Facebook Page, generate a page access token (FACEBOOK_PAGE_ACCESS_TOKEN) and note the page id (FACEBOOK_PAGE_ID).',
      docsUrl: 'https://developers.facebook.com/docs/pages-api/getting-started',
      apiBase: 'https://graph.facebook.com',
      probeUrl: 'https://graph.facebook.com/v22.0/me',
    },
  },
  linkedin: {
    label: 'LinkedIn',
    archive: {
      title: 'Import a LinkedIn data export',
      hint: 'Settings & Privacy -> Data privacy -> Get a copy of your data. Pick "Want something in particular?" and request "Messages" + "Posts".',
      fileHint: 'messages.csv, Shares.csv',
    },
    apiCredentials: {
      title: 'Connect the LinkedIn REST API',
      envVar: 'LINKEDIN_ACCESS_TOKEN',
      hint: 'Create an app at https://www.linkedin.com/developers/, request the "Share on LinkedIn" + "Sign In with LinkedIn using OpenID Connect" products, and paste the OAuth2 access token plus your author URN (LINKEDIN_AUTHOR_URN).',
      docsUrl:
        'https://learn.microsoft.com/en-us/linkedin/shared/authentication/authentication',
      apiBase: 'https://api.linkedin.com',
      probeUrl: 'https://api.linkedin.com/v2/me',
    },
  },
  'habr-career': {
    label: 'career.habr.com',
    archive: {
      title: 'Import a career.habr.com applications JSON',
      hint: 'On career.habr.com, open your account, go to "Отклики на вакансии" and use the export-to-JSON action. Save the file and load it into the SPA.',
      fileHint: 'applications.json',
    },
    apiCredentials: {
      title: 'Connect the career.habr.com private API',
      envVar: 'HABR_CAREER_ACCESS_TOKEN',
      hint: 'Generate a personal access token from career.habr.com -> Settings -> Tokens, and paste it as "secret:habr-career:token".',
      docsUrl: 'https://career.habr.com/info/agreement',
      apiBase: 'https://career.habr.com',
      probeUrl: 'https://career.habr.com/api/frontend/me',
    },
  },
  hh: {
    label: 'hh.ru',
    archive: {
      title: 'Import an hh.ru negotiations archive',
      hint: 'Open https://hh.ru/applicant/negotiations, use the JSON export, save the file and load it here.',
      fileHint: 'negotiations.json',
    },
    apiCredentials: {
      title: 'Connect the hh.ru API',
      envVar: 'HH_ACCESS_TOKEN',
      hint: 'Register an app at https://dev.hh.ru/, run the OAuth2 client-credentials/authorisation-code flow and paste the access token as "secret:hh:token".',
      docsUrl: 'https://github.com/hhru/api',
      apiBase: 'https://api.hh.ru',
      probeUrl: 'https://api.hh.ru/me',
    },
  },
  superjob: {
    label: 'superjob.ru',
    archive: {
      title: 'Import a SuperJob responses archive',
      hint: 'On superjob.ru, open your applicant cabinet -> "Отклики" and use the JSON export action. Save the file and load it here.',
      fileHint: 'responses.json',
    },
    apiCredentials: {
      title: 'Connect the SuperJob API',
      envVar: 'SUPERJOB_ACCESS_TOKEN',
      hint: 'Register an application at https://api.superjob.ru/register/, copy the secret key as SUPERJOB_APP_ID and the access token as "secret:superjob:token".',
      docsUrl: 'https://api.superjob.ru/',
      apiBase: 'https://api.superjob.ru',
      probeUrl: 'https://api.superjob.ru/2.0/user/current/',
    },
  },
};

// Section -> guide. Keys mirror `navItems` in views.js (R-M1).
export const connectionGuides = {
  chat: {
    title: 'Your unified inbox starts empty.',
    body: 'meta-sovereign keeps every chat from every connected service in one place. Connect a provider below, or import an exported archive to populate this view.',
    providers: [
      'email',
      'telegram',
      'vk',
      'x',
      'whatsapp',
      'facebook',
      'linkedin',
    ],
  },
  operator: {
    title: 'Operator queue is empty.',
    body: 'The operator card stream walks you through unread messages chat by chat. Connect a chat-capable provider below to start the queue.',
    providers: [
      'email',
      'telegram',
      'vk',
      'x',
      'whatsapp',
      'facebook',
      'linkedin',
    ],
  },
  contacts: {
    title: 'No contacts yet.',
    body: 'Contacts are aggregated from every connected provider so the same person across networks shows up once. Add a provider to populate this list.',
    providers: [
      'email',
      'telegram',
      'vk',
      'x',
      'whatsapp',
      'facebook',
      'linkedin',
      'habr-career',
      'hh',
      'superjob',
    ],
  },
  automation: {
    title: 'No automation graphs yet.',
    body: 'Automation graphs route incoming messages from a pattern to a reply variation. Drop a node above, or import an archive first so you have data to match against.',
    providers: ['email', 'telegram', 'vk', 'x', 'whatsapp', 'facebook'],
  },
  patterns: {
    title: 'No patterns yet.',
    body: 'Patterns are inferred from example messages. Connect a provider, or import an archive, then come back here and feed the inferrer a few examples.',
    providers: ['email', 'telegram', 'vk', 'x', 'whatsapp'],
  },
  replies: {
    title: 'No reply variation groups yet.',
    body: 'Reply groups are extracted from your previous outgoing messages by fuzzy similarity. Connect a chat-capable provider to seed your reply library.',
    providers: [
      'email',
      'telegram',
      'vk',
      'x',
      'whatsapp',
      'facebook',
      'linkedin',
    ],
  },
  facts: {
    title: 'No facts extracted yet.',
    body: 'Facts are question -> answer pairs extracted across messages by your patterns. Add a pattern with a capture group, or connect a chat provider to start gathering data.',
    providers: ['email', 'telegram', 'vk', 'x', 'whatsapp'],
  },
  audience: {
    title: 'Build your first audience.',
    body: 'Cross-reference contacts using AND/OR/NOT plus dimensions like network:, chat:, sender:, kind:, fact:. Connect at least one provider so you have contacts to filter.',
    providers: [
      'email',
      'telegram',
      'vk',
      'x',
      'whatsapp',
      'facebook',
      'linkedin',
    ],
  },
  broadcast: {
    title: 'No broadcast targets yet.',
    body: 'Broadcasts post the same message to every connected feed. Connect a public-posting provider below to enable a target checkbox.',
    providers: ['x', 'vk', 'facebook', 'linkedin', 'telegram'],
  },
  outreach: {
    title: 'No outreach surface yet.',
    body: 'Mass-personal outreach sends a templated message 1:1 to each contact in an audience query. Connect a chat-capable provider to enable outreach.',
    providers: ['email', 'telegram', 'vk', 'x', 'whatsapp', 'linkedin'],
  },
  profile: {
    title: 'No profile yet.',
    body: 'Edit your profile and resume here; saves are pushed to every connected provider. Connect at least one provider so the sync envelope has somewhere to go.',
    providers: [
      'telegram',
      'vk',
      'x',
      'linkedin',
      'habr-career',
      'hh',
      'superjob',
    ],
  },
  backup: {
    title: 'No backup archives yet.',
    body: 'Backups are encrypted-at-rest archives of the local store. Set a passphrase above, click "create backup" once you have data worth saving, or start a local server first if you want backups to live on disk.',
    providers: [],
  },
  status: {
    title: 'Status is showing the local store only.',
    body: 'Status fields appear once a server is reachable. Either start a local server below, or keep working fully offline — the SPA writes straight to your browser store.',
    providers: [],
  },
};

// CORS-detecting fetch helper (R-M5, R-M6, R-M8).
//
// Returns one of:
//   { ok: true, status: number }
//   { ok: false, classification: 'cors', error: <Error> }
//   { ok: false, classification: 'http', status: number }
//   { ok: false, classification: 'network', error: <Error> }
//
// Heuristic for the CORS classification: when a cross-origin `fetch()`
// rejects before producing a response (e.g. the typical
// `TypeError: Failed to fetch`), the most likely cause is a missing
// `Access-Control-Allow-Origin` header on the upstream. Same-origin
// rejects are reported as plain network errors instead.
export const isCrossOrigin = (url, currentOrigin) => {
  try {
    const target = new URL(url);
    const here = new URL(currentOrigin ?? 'http://localhost');
    return target.origin !== here.origin;
  } catch {
    return false;
  }
};

export const tryDirect = async ({
  url,
  fetchImpl,
  origin,
  signal,
  init,
} = {}) => {
  if (!url) {
    throw new Error('tryDirect: url is required');
  }
  const fetchFn = fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!fetchFn) {
    return {
      ok: false,
      classification: 'network',
      error: new Error('no fetch implementation available'),
    };
  }
  const currentOrigin =
    origin ?? (globalThis.location ? globalThis.location.origin : null);
  try {
    const response = await fetchFn(url, { ...init, signal });
    if (response && response.ok) {
      return { ok: true, status: response.status };
    }
    return {
      ok: false,
      classification: 'http',
      status: response?.status ?? 0,
    };
  } catch (error) {
    const crossOrigin = isCrossOrigin(url, currentOrigin);
    return {
      ok: false,
      classification: crossOrigin ? 'cors' : 'network',
      error,
    };
  }
};

// Inline copy for the local-server install instructions (R-M7).
// Kept as data so the React component renders one shape and the unit
// tests can assert on the strings without booting JSX.
export const localServerHelp = {
  title: 'Start a local server to unblock this provider',
  body: 'A same-origin local server proxies the provider request and side-steps the browsers CORS rule. Pick the runtime you have installed.',
  options: [
    {
      id: 'rust',
      heading: 'Rust (recommended)',
      command:
        'cargo run --manifest-path rust/Cargo.toml -p meta-sovereign-server -- serve',
      hint: 'Uses the pure-Rust binary from this repository. Defaults to http://127.0.0.1:8787.',
    },
    {
      id: 'js-node',
      heading: 'Node / Bun / Deno',
      command: 'npx -y meta-sovereign serve',
      hint: 'Reuses the published JS server. Defaults to http://127.0.0.1:8787.',
    },
    {
      id: 'docker',
      heading: 'Docker',
      command: 'docker compose up web',
      hint: 'Spins up the same JS server in a container. See docker/web.Dockerfile.',
    },
  ],
  manualOverride: {
    storageKey: 'metaServer',
    hint: 'Once the server is running, paste its URL below and click "use this server" — the SPA will store it and reload.',
  },
};

// Convenience helper used by the React component below: persist a
// manual server override (R-J2) and reload so discovery picks it up.
export const applyLocalServerOverride = (origin, { storage, reload } = {}) => {
  if (!origin) {
    return false;
  }
  saveServerOverride(origin, storage ?? globalThis.localStorage);
  if (typeof reload === 'function') {
    reload();
  } else if (globalThis.location?.reload) {
    globalThis.location.reload();
  }
  return true;
};

export const listGuideSections = () => Object.keys(connectionGuides);

export const getGuide = (section) => {
  const guide = connectionGuides[section];
  if (!guide) {
    throw new Error(`unknown nav surface "${section}"`);
  }
  return guide;
};

export const getProvider = (id) => {
  const provider = providerCatalogue[id];
  if (!provider) {
    throw new Error(`unknown provider "${id}"`);
  }
  return provider;
};
