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
//
// Issue #16 / R-O1, R-O2 additions per provider:
//   - `apiCredentials.fields` enumerates the credential inputs the
//     Settings → Connections card renders (text/password). Each field
//     names the `secret:*` link id it persists into.
//   - `apiCredentials.probeUrlTemplate` is a string with `{token}` /
//     `{phoneNumberId}` / `{appId}` placeholders that resolve against
//     the entered credentials. `buildProbeUrl()` returns `null` when a
//     required field is missing so the UI can show "Enter a token to
//     enable probe" rather than firing a guaranteed-404/400 request.
//   - `apiCredentials.probeRequiresAll` lists the field ids that must
//     be present before a probe can run. Empty / missing fields cause
//     `buildProbeUrl()` to return `null`.
//   - `apiCredentials.errorHints` maps an HTTP status to a user-facing
//     remediation hint surfaced by `<ProbeRow>`.
//   - `archive.accept` is the `<input type="file" accept>` filter used
//     by the Settings → Connections archive uploader (R-O4).
export const providerCatalogue = {
  email: {
    label: 'Email',
    archive: {
      title: 'Import .eml or mbox mail exports',
      hint: 'Export mail from your provider as .eml files or an mbox archive, including Gmail Takeout mbox files. Drop the file into the import box with source "email".',
      fileHint: '*.eml, *.mbox',
      accept: '.eml,.mbox,message/rfc822,application/mbox',
    },
    apiCredentials: {
      title: 'Connect email APIs and protocols',
      envVar: 'EMAIL_ACCESS_TOKEN',
      hint: 'Use JMAP, Gmail API, or Microsoft Graph directly from the browser when CORS allows it. IMAP, POP3, and SMTP require the local server because browsers cannot open raw TCP/TLS mail sockets.',
      docsUrl: 'https://jmap.io/spec/',
      apiBase: 'https://gmail.googleapis.com',
      probeUrl: 'https://gmail.googleapis.com/gmail/v1/users/me/profile',
      probeUrlTemplate:
        'https://gmail.googleapis.com/gmail/v1/users/me/profile',
      probeHeaders: { Authorization: 'Bearer {token}' },
      probeRequiresAll: ['token'],
      fields: [
        {
          id: 'token',
          label: 'OAuth access token',
          type: 'password',
          placeholder: 'ya29.…',
          secretId: 'secret:email:access-token',
        },
      ],
      errorHints: {
        401: 'Token rejected. Re-issue an OAuth token with the gmail.readonly scope.',
        403: 'Insufficient scope. Re-issue the token with gmail.readonly or jmap permissions.',
      },
    },
  },
  telegram: {
    label: 'Telegram',
    archive: {
      title: 'Import a Telegram Desktop archive',
      hint: 'Telegram Desktop -> Settings -> Advanced -> Export Telegram data. Pick "Personal chats" + "JSON" and drop the resulting "result.json" into the import box below.',
      fileHint: 'result.json',
      accept: '.json,application/json',
    },
    apiCredentials: {
      title: 'Connect the Telegram Bot API',
      envVar: 'TELEGRAM_BOT_TOKEN',
      hint: 'Talk to @BotFather inside Telegram, run /newbot, copy the bot token and paste it as the secret named "secret:telegram:bot-token".',
      docsUrl: 'https://core.telegram.org/bots#how-do-i-create-a-bot',
      apiBase: 'https://api.telegram.org',
      probeUrl: 'https://api.telegram.org/bot/getMe',
      probeUrlTemplate: 'https://api.telegram.org/bot{token}/getMe',
      probeRequiresAll: ['token'],
      fields: [
        {
          id: 'token',
          label: 'Bot token',
          type: 'password',
          placeholder: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
          secretId: 'secret:telegram:bot-token',
        },
      ],
      errorHints: {
        401: 'Token rejected. Ask @BotFather for a fresh token or revoke the leaked one.',
        404: 'Endpoint not found. Double-check there is no whitespace in the bot token.',
      },
    },
  },
  vk: {
    label: 'VK',
    archive: {
      title: 'Import a VK conversations archive',
      hint: 'Open https://vk.com/data_protection, request your archive, unzip it and load the "messages" JSON files.',
      fileHint: 'messages*.json',
      accept: '.json,application/json',
    },
    apiCredentials: {
      title: 'Connect the VK API',
      envVar: 'VK_ACCESS_TOKEN',
      hint: 'Create a Standalone application at https://vk.com/apps?act=manage and request an access token with the messages scope. Paste it as "secret:vk:token".',
      docsUrl: 'https://dev.vk.com/api/access-token/getting-started',
      apiBase: 'https://api.vk.com',
      probeUrl: 'https://api.vk.com/method/users.get?v=5.199',
      probeUrlTemplate:
        'https://api.vk.com/method/users.get?v=5.199&access_token={token}',
      probeRequiresAll: ['token'],
      fields: [
        {
          id: 'token',
          label: 'Access token',
          type: 'password',
          placeholder: 'vk1.a.…',
          secretId: 'secret:vk:access-token',
        },
      ],
      errorHints: {
        401: 'Access token expired. Re-run the implicit flow at id.vk.com.',
      },
    },
  },
  x: {
    label: 'X (Twitter)',
    archive: {
      title: 'Import an X data archive',
      hint: 'Settings -> Your account -> Download an archive of your data. Once the archive is ready, unzip it and select the JSON files under data/ for tweets and direct messages.',
      fileHint: 'tweets.js, direct-messages.js',
      accept: '.js,.json,application/json',
    },
    apiCredentials: {
      title: 'Connect the X API v2',
      envVar: 'X_ACCESS_TOKEN',
      hint: 'Create an app at https://developer.x.com/, generate a user-context bearer token, and paste it as "secret:x:token".',
      docsUrl: 'https://developer.x.com/en/docs/authentication/oauth-2-0',
      apiBase: 'https://api.x.com',
      probeUrl: 'https://api.x.com/2/users/me',
      probeUrlTemplate: 'https://api.x.com/2/users/me',
      probeRequiresAll: ['token'],
      probeHeaders: { Authorization: 'Bearer {token}' },
      fields: [
        {
          id: 'token',
          label: 'Bearer token',
          type: 'password',
          placeholder: 'AAAAAAAAAAAAAAAAAAAAAA…',
          secretId: 'secret:x:bearer-token',
        },
      ],
      errorHints: {
        401: 'Bearer token rejected. Generate a new one in the X developer portal.',
        403: 'Token is valid but lacks the users.read scope.',
      },
    },
  },
  whatsapp: {
    label: 'WhatsApp',
    archive: {
      title: 'Import a WhatsApp chat export',
      hint: 'In the WhatsApp app, open a chat -> ... -> More -> Export chat (no media). Drop the resulting "WhatsApp Chat with NAME.txt" into the import box.',
      fileHint: 'WhatsApp Chat with *.txt',
      accept: '.txt,text/plain',
    },
    apiCredentials: {
      title: 'Connect the WhatsApp Cloud API',
      envVar: 'WHATSAPP_ACCESS_TOKEN',
      hint: 'Create a Meta for Developers app, add the WhatsApp product, copy the temporary or system-user access token and the phone number id (WHATSAPP_PHONE_NUMBER_ID).',
      docsUrl:
        'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started',
      apiBase: 'https://graph.facebook.com',
      probeUrl: 'https://graph.facebook.com/v22.0/me',
      probeUrlTemplate:
        'https://graph.facebook.com/v22.0/me?access_token={token}',
      probeRequiresAll: ['token'],
      fields: [
        {
          id: 'token',
          label: 'Access token',
          type: 'password',
          placeholder: 'EAAG…',
          secretId: 'secret:whatsapp:access-token',
        },
        {
          id: 'phoneNumberId',
          label: 'Phone number ID',
          type: 'text',
          placeholder: '15550012345',
          secretId: 'secret:whatsapp:phone-number-id',
          optional: true,
        },
      ],
      errorHints: {
        400: 'Meta returned 400. Re-check the access token and that the app is in Live mode.',
        401: 'Access token rejected. Generate a new system-user token in Meta Business.',
      },
    },
  },
  facebook: {
    label: 'Facebook',
    archive: {
      title: 'Import a Facebook download',
      hint: 'Settings & privacy -> Settings -> Your information -> Download your information. Choose "JSON" and select the categories you need (messages, posts).',
      fileHint: 'messages_*.json, posts_*.json',
      accept: '.json,application/json,.zip,application/zip',
    },
    apiCredentials: {
      title: 'Connect the Facebook Graph API',
      envVar: 'FACEBOOK_PAGE_ACCESS_TOKEN',
      hint: 'In your Meta for Developers app, add a Facebook Page, generate a page access token (FACEBOOK_PAGE_ACCESS_TOKEN) and note the page id (FACEBOOK_PAGE_ID).',
      docsUrl: 'https://developers.facebook.com/docs/pages-api/getting-started',
      apiBase: 'https://graph.facebook.com',
      probeUrl: 'https://graph.facebook.com/v22.0/me',
      probeUrlTemplate:
        'https://graph.facebook.com/v22.0/me?access_token={token}',
      probeRequiresAll: ['token'],
      fields: [
        {
          id: 'token',
          label: 'Page access token',
          type: 'password',
          placeholder: 'EAAG…',
          secretId: 'secret:facebook:access-token',
        },
        {
          id: 'pageId',
          label: 'Page ID',
          type: 'text',
          placeholder: '123456789012345',
          secretId: 'secret:facebook:page-id',
          optional: true,
        },
      ],
      errorHints: {
        400: 'Graph returned 400. Verify the access token has not expired (page tokens are short-lived).',
        401: 'Access token rejected. Re-issue a fresh page token in Graph API Explorer.',
      },
    },
  },
  linkedin: {
    label: 'LinkedIn',
    archive: {
      title: 'Import a LinkedIn data export',
      hint: 'Settings & Privacy -> Data privacy -> Get a copy of your data. Pick "Want something in particular?" and request "Messages" + "Posts".',
      fileHint: 'messages.csv, Shares.csv',
      accept: '.csv,text/csv,.json,application/json',
    },
    apiCredentials: {
      title: 'Connect the LinkedIn REST API',
      envVar: 'LINKEDIN_ACCESS_TOKEN',
      hint: 'Create an app at https://www.linkedin.com/developers/, request the "Share on LinkedIn" + "Sign In with LinkedIn using OpenID Connect" products, and paste the OAuth2 access token plus your author URN (LINKEDIN_AUTHOR_URN).',
      docsUrl:
        'https://learn.microsoft.com/en-us/linkedin/shared/authentication/authentication',
      apiBase: 'https://api.linkedin.com',
      probeUrl: 'https://api.linkedin.com/v2/me',
      probeUrlTemplate: 'https://api.linkedin.com/v2/me',
      probeRequiresAll: ['token'],
      probeHeaders: { Authorization: 'Bearer {token}' },
      fields: [
        {
          id: 'token',
          label: 'Access token',
          type: 'password',
          placeholder: 'AQU…',
          secretId: 'secret:linkedin:access-token',
        },
        {
          id: 'authorUrn',
          label: 'Author URN',
          type: 'text',
          placeholder: 'urn:li:person:abc',
          secretId: 'secret:linkedin:author-urn',
          optional: true,
        },
      ],
      errorHints: {
        401: 'OAuth2 access token rejected. Re-run the auth code flow.',
      },
    },
  },
  'habr-career': {
    label: 'career.habr.com',
    archive: {
      title: 'Import a career.habr.com applications JSON',
      hint: 'On career.habr.com, open your account, go to "Отклики на вакансии" and use the export-to-JSON action. Save the file and load it into the SPA.',
      fileHint: 'applications.json',
      accept: '.json,application/json',
    },
    apiCredentials: {
      title: 'Connect the career.habr.com private API',
      envVar: 'HABR_CAREER_ACCESS_TOKEN',
      hint: 'Generate a personal access token from career.habr.com -> Settings -> Tokens, and paste it as "secret:habr-career:token".',
      docsUrl: 'https://career.habr.com/info/agreement',
      apiBase: 'https://career.habr.com',
      probeUrl: 'https://career.habr.com/api/frontend/me',
      probeUrlTemplate: 'https://career.habr.com/api/frontend/me',
      probeRequiresAll: ['token'],
      probeHeaders: { Authorization: 'Bearer {token}' },
      fields: [
        {
          id: 'token',
          label: 'Personal access token',
          type: 'password',
          secretId: 'secret:habr-career:access-token',
        },
      ],
      errorHints: {
        401: 'career.habr.com rejected the token. Re-issue it from Settings -> Tokens.',
      },
    },
  },
  hh: {
    label: 'hh.ru',
    archive: {
      title: 'Import an hh.ru negotiations archive',
      hint: 'Open https://hh.ru/applicant/negotiations, use the JSON export, save the file and load it here.',
      fileHint: 'negotiations.json',
      accept: '.json,application/json',
    },
    apiCredentials: {
      title: 'Connect the hh.ru API',
      envVar: 'HH_ACCESS_TOKEN',
      hint: 'Register an app at https://dev.hh.ru/, run the OAuth2 client-credentials/authorisation-code flow and paste the access token as "secret:hh:token".',
      docsUrl: 'https://github.com/hhru/api',
      apiBase: 'https://api.hh.ru',
      probeUrl: 'https://api.hh.ru/me',
      probeUrlTemplate: 'https://api.hh.ru/me',
      probeRequiresAll: ['token'],
      probeHeaders: { Authorization: 'Bearer {token}' },
      fields: [
        {
          id: 'token',
          label: 'Access token',
          type: 'password',
          secretId: 'secret:hh:access-token',
        },
      ],
      errorHints: {
        401: 'hh.ru rejected the token. Refresh it via your app at https://dev.hh.ru/.',
      },
    },
  },
  github: {
    label: 'GitHub',
    archive: {
      title: 'Import a gh api JSON dump',
      hint: 'Save a JSON dump from `gh api` (e.g. `gh api repos/OWNER/REPO/issues --paginate > issues.json`) or an envelope `{ issues, comments, pulls, reviews, reviewComments, discussions }` and drop the file here.',
      fileHint: 'issues.json, pulls.json, comments.json, envelope.json',
      accept: '.json,application/json',
    },
    apiCredentials: {
      title: 'Connect the GitHub REST API',
      envVar: 'GITHUB_TOKEN',
      hint: 'Create a fine-grained personal access token at https://github.com/settings/personal-access-tokens with read access to issues, pull requests, and the repositories you want to clone, plus write access to issues if you intend to post comments. Paste it as "secret:github:access-token".',
      docsUrl:
        'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens',
      apiBase: 'https://api.github.com',
      probeUrl: 'https://api.github.com/user',
      probeUrlTemplate: 'https://api.github.com/user',
      probeRequiresAll: ['token'],
      probeHeaders: {
        Authorization: 'Bearer {token}',
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      fields: [
        {
          id: 'token',
          label: 'Personal access token',
          type: 'password',
          placeholder: 'github_pat_… or ghp_…',
          secretId: 'secret:github:access-token',
        },
      ],
      errorHints: {
        401: 'Token rejected. Re-issue a personal access token at https://github.com/settings/personal-access-tokens.',
        403: 'GitHub returned 403. The token may be missing scopes (issues:read, pull_requests:read, contents:read) or hitting a secondary rate limit.',
        404: 'Repository not found or not visible. Confirm the token has access to the target owner/repo.',
      },
    },
  },
  superjob: {
    label: 'superjob.ru',
    archive: {
      title: 'Import a SuperJob responses archive',
      hint: 'On superjob.ru, open your applicant cabinet -> "Отклики" and use the JSON export action. Save the file and load it here.',
      fileHint: 'responses.json',
      accept: '.json,application/json',
    },
    apiCredentials: {
      title: 'Connect the SuperJob API',
      envVar: 'SUPERJOB_ACCESS_TOKEN',
      hint: 'Register an application at https://api.superjob.ru/register/, copy the secret key as SUPERJOB_APP_ID and the access token as "secret:superjob:token".',
      docsUrl: 'https://api.superjob.ru/',
      apiBase: 'https://api.superjob.ru',
      probeUrl: 'https://api.superjob.ru/2.0/user/current/',
      probeUrlTemplate: 'https://api.superjob.ru/2.0/user/current/',
      probeRequiresAll: ['appId'],
      probeHeaders: { 'X-Api-App-Id': '{appId}' },
      fields: [
        {
          id: 'appId',
          label: 'App ID (X-Api-App-Id)',
          type: 'password',
          secretId: 'secret:superjob:app-id',
        },
        {
          id: 'token',
          label: 'Access token',
          type: 'password',
          secretId: 'secret:superjob:access-token',
          optional: true,
        },
      ],
      errorHints: {
        401: 'SuperJob rejected the App ID. Re-check it in your applicant cabinet.',
      },
    },
  },
};

// Section -> guide. Keys mirror `navItems` in views.js (R-M1).
//
// Issue #16 / R-O7 additions:
//   - `connectFirst` is the per-section deep-link the empty-state card
//     shows. It points the user at Settings → Connections and scrolls to
//     the first relevant provider card (`#conn-{providerId}`).
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
      'github',
    ],
    connectFirst: { providerId: 'telegram' },
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
      'github',
    ],
    connectFirst: { providerId: 'telegram' },
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
      'github',
    ],
    connectFirst: { providerId: 'telegram' },
  },
  automation: {
    title: 'No automation graphs yet.',
    body: 'Automation graphs route incoming messages from a pattern to a reply variation. Drop a node above, or import an archive first so you have data to match against.',
    providers: [
      'email',
      'telegram',
      'vk',
      'x',
      'whatsapp',
      'facebook',
      'github',
    ],
    connectFirst: { providerId: 'telegram' },
  },
  patterns: {
    title: 'No patterns yet.',
    body: 'Patterns are inferred from example messages. Connect a provider, or import an archive, then come back here and feed the inferrer a few examples.',
    providers: ['email', 'telegram', 'vk', 'x', 'whatsapp'],
    connectFirst: { providerId: 'telegram' },
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
      'github',
    ],
    connectFirst: { providerId: 'telegram' },
  },
  facts: {
    title: 'No facts extracted yet.',
    body: 'Facts are question -> answer pairs extracted across messages by your patterns. Add a pattern with a capture group, or connect a chat provider to start gathering data.',
    providers: ['email', 'telegram', 'vk', 'x', 'whatsapp'],
    connectFirst: { providerId: 'telegram' },
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
      'github',
    ],
    connectFirst: { providerId: 'telegram' },
  },
  broadcast: {
    title: 'No broadcast targets yet.',
    body: 'Broadcasts post the same message to every connected feed. Connect a public-posting provider below to enable a target checkbox.',
    providers: ['x', 'vk', 'facebook', 'linkedin', 'telegram'],
    connectFirst: { providerId: 'x' },
  },
  outreach: {
    title: 'No outreach surface yet.',
    body: 'Mass-personal outreach sends a templated message 1:1 to each contact in an audience query. Connect a chat-capable provider to enable outreach.',
    providers: [
      'email',
      'telegram',
      'vk',
      'x',
      'whatsapp',
      'linkedin',
      'github',
    ],
    connectFirst: { providerId: 'telegram' },
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
    connectFirst: { providerId: 'linkedin' },
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
  settings: {
    title: 'Settings',
    body: 'Provider connections, credentials, and archive imports live here. The list below mirrors every catalogued provider; pick one to enter its credentials, upload an archive, and probe the live API.',
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

// ---- R-O1, R-O2: probe URL templates ---------------------------------
//
// `buildProbeUrl({ provider, credentials })` resolves the provider's
// `probeUrlTemplate` against entered credentials. Returns a string when
// every field listed in `probeRequiresAll` is present and non-empty, and
// `null` otherwise — the UI uses the `null` to surface "Enter a token to
// enable probe" instead of firing a guaranteed-404/400 request (the
// exact bug from issue #16).
//
// Pure function. Templates allow `{token}`, `{phoneNumberId}`, `{appId}`
// and any other field id surfaced by `provider.apiCredentials.fields`.
export const interpolate = (template, values) =>
  String(template).replace(/\{(\w+)\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      const next = values[key];
      return next === undefined || next === null ? '' : String(next);
    }
    return match;
  });

const requiredFieldsFor = (provider) => {
  const required = provider.apiCredentials?.probeRequiresAll;
  if (Array.isArray(required) && required.length > 0) {
    return required;
  }
  return (provider.apiCredentials?.fields ?? [])
    .filter((field) => !field.optional)
    .map((field) => field.id);
};

export const hasRequiredCredentials = (provider, credentials = {}) => {
  for (const id of requiredFieldsFor(provider)) {
    const value = credentials[id];
    if (typeof value !== 'string' || value.length === 0) {
      return false;
    }
  }
  return true;
};

export const buildProbeUrl = ({ provider, credentials = {} } = {}) => {
  if (!provider || !provider.apiCredentials) {
    return null;
  }
  const template = provider.apiCredentials.probeUrlTemplate;
  if (typeof template !== 'string' || template.length === 0) {
    return null;
  }
  if (!hasRequiredCredentials(provider, credentials)) {
    return null;
  }
  return interpolate(template, credentials);
};

export const buildProbeHeaders = ({ provider, credentials = {} } = {}) => {
  const headers = provider?.apiCredentials?.probeHeaders;
  if (!headers || typeof headers !== 'object') {
    return {};
  }
  if (!hasRequiredCredentials(provider, credentials)) {
    return {};
  }
  const out = {};
  for (const [name, value] of Object.entries(headers)) {
    out[name] = interpolate(value, credentials);
  }
  return out;
};

// Convenience: used by the Settings UI to read every credential field
// for a provider out of an array of `secret:*` links.
export const credentialsFromLinks = (provider, links = []) => {
  const fields = provider?.apiCredentials?.fields ?? [];
  const byId = new Map();
  for (const link of links) {
    if (link?.id) {
      byId.set(link.id, link);
    }
  }
  const out = {};
  for (const field of fields) {
    const link = byId.get(field.secretId);
    if (link && typeof link.value === 'string') {
      out[field.id] = link.value;
    }
  }
  return out;
};
