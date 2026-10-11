#!/usr/bin/env node
/**
 * Issue #32 experiment: classify which VK client_ids still pass the
 * oauth.vk.com implicit-flow gate *before* the user logs in.
 *
 * No account, cookie or token is used. The probe only asks
 * `https://oauth.vk.com/authorize` whether it is willing to show a login
 * page for a given client_id. Possible outcomes:
 *
 *   - `login-page`      VK rendered its login form: the app is not blocked
 *                       at the OAuth layer (it may still be rate-limited or
 *                       denied at the API layer after login).
 *   - `blocked`         `{"error":"invalid_request","error_description":"application is blocked"}`
 *   - `disabled`        `... "application is disabled"`
 *   - `deleted`         `... "application was deleted"`
 *   - `direct-auth-only` `... "incorrect app. Unavailable for apps with direct auth."`
 *                       (official VK clients: they only log in through the
 *                       private password grant, never through this page)
 *   - `no-messages`     `{"error":"invalid_scope","error_description":"Only desktop applications have access to user messages"}`
 *                       (the app exists but may not request `messages`)
 *   - `security-error`  `{"error":"invalid_request","error_description":"Security Error"}`
 *                       (usually redirect_uri / platform mismatch: the app is
 *                       not allowed to use the implicit flow with blank.html)
 *   - `unknown:<text>`  anything else, verbatim.
 *
 * A `login-page` result only proves the OAuth gate is open. Kate Mobile still
 * returns `login-page` although VK stopped serving its API traffic on
 * 2026-09-08, so the result is necessary but not sufficient.
 *
 * The classifier lives in js/src/sources/vk-auth.js (`classifyVkOAuthGate`)
 * so the library and this probe can never disagree.
 *
 * Usage: node experiments/issue-32/probe-vk-oauth-apps.mjs [--json] [--vk-ru]
 */

import {
  buildVkAuthorizeUrl,
  classifyVkOAuthGate,
} from '../../js/src/sources/vk-auth.js';

const APPS = [
  // Everything listed on https://vkhost.github.io/ (script.js?210829).
  { id: 6121396, name: 'VK Admin (Android)', source: 'vkhost' },
  { id: 5776857, name: 'VK Admin (iOS)', source: 'vkhost' },
  { id: 6463690, name: 'Marusya', source: 'vkhost' },
  { id: 7556576, name: 'Sferum', source: 'vkhost' },
  { id: 7598572, name: 'Sferum Android', source: 'vkhost' },
  { id: 7571751, name: 'VK Education iOS', source: 'vkhost' },
  { id: 7793118, name: 'VK Calls', source: 'vkhost' },
  { id: 6287487, name: 'vk.com (web)', source: 'vkhost' },
  { id: 7799655, name: 'VK Mail', source: 'vkhost' },
  { id: 7539952, name: 'Mail.ru Mail', source: 'vkhost' },
  { id: 7497650, name: 'VK Connect', source: 'vkhost' },
  { id: 5530956, name: 'Prisma', source: 'vkhost' },
  { id: 3698024, name: 'Instagram', source: 'vkhost' },
  { id: 2685278, name: 'Kate Mobile', source: 'vkhost' },
  { id: 4083558, name: 'VFeed', source: 'vkhost' },
  // Official VK clients that are widely documented in open-source
  // libraries (vk_api, vkbottle, VK-Messenger forks).
  { id: 2274003, name: 'VK for Android (official)', source: 'official' },
  { id: 3140623, name: 'VK for iPhone (official)', source: 'official' },
  { id: 3682744, name: 'VK for iPad (official)', source: 'official' },
  { id: 3697615, name: 'VK for Windows (official)', source: 'official' },
  { id: 3502557, name: 'VK for Windows Phone (official)', source: 'official' },
  { id: 6146827, name: 'VK Me (official)', source: 'official' },
  // Controls that pin the meaning of each outcome.
  { id: 999999999, name: 'control: never existed', source: 'control' },
  { id: 12345, name: 'control: web app without messages', source: 'control' },
];

const SCOPE = 'messages,offline';
const HOST = process.argv.includes('--vk-ru')
  ? 'https://oauth.vk.ru'
  : 'https://oauth.vk.com';

const probe = async (app) => {
  const response = await fetch(
    buildVkAuthorizeUrl({ clientId: app.id, scope: SCOPE, host: HOST }),
    { redirect: 'manual', headers: { 'Accept-Language': 'en' } }
  );
  const body = await response.text();
  const outcome = classifyVkOAuthGate({ status: response.status, body });
  return {
    ...app,
    status: response.status,
    location: response.headers.get('location'),
    outcome:
      outcome === 'unknown'
        ? `unknown:${body.slice(0, 120).replace(/\s+/g, ' ')}`
        : outcome,
  };
};

const results = [];
for (const app of APPS) {
  try {
    results.push(await probe(app));
  } catch (error) {
    results.push({ ...app, outcome: `fetch-failed:${error.message}` });
  }
}

if (process.argv.includes('--json')) {
  console.log(
    JSON.stringify({ probedAt: new Date().toISOString(), results }, null, 2)
  );
} else {
  console.log(
    `probed at ${new Date().toISOString()} (host=${HOST}, scope=${SCOPE})`
  );
  for (const r of results) {
    console.log(
      `${String(r.id).padStart(8)}  ${r.source.padEnd(8)}  ${String(r.status ?? '-').padEnd(4)} ${r.outcome.padEnd(16)} ${r.name}${r.location ? `  -> ${r.location}` : ''}`
    );
  }
}
