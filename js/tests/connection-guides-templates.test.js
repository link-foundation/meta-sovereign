// Issue #16 / R-O1, R-O2, R-O11: probe URL template tests.
//
// Asserts:
//   - every provider exposes a `probeUrlTemplate` and `fields` schema
//   - the template + saved credentials interpolate into a URL that is
//     not the broken legacy URL (which would 404/400)
//   - missing required credentials cause `buildProbeUrl` to return null
//   - `buildProbeHeaders` interpolates Authorization + X-Api-App-Id
//     templates and returns {} when credentials are missing
//   - per-section `connectFirst` deep-link fields point at known
//     providers

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProbeUrl,
  buildProbeHeaders,
  connectionGuides,
  credentialsFromLinks,
  hasRequiredCredentials,
  interpolate,
  providerCatalogue,
} from '../src/web/connection-guides.js';

const SAMPLE_TOKEN = '123456:ABC-DEFsample';
const SAMPLE_PHONE = '15550009999';
const SAMPLE_APP_ID = 'sj_app_id_42';

const sampleCredentials = (provider) => {
  const out = {};
  for (const field of provider.apiCredentials.fields) {
    if (field.id === 'phoneNumberId') {
      out[field.id] = SAMPLE_PHONE;
    } else if (field.id === 'appId') {
      out[field.id] = SAMPLE_APP_ID;
    } else if (field.id === 'pageId') {
      out[field.id] = '12345';
    } else if (field.id === 'authorUrn') {
      out[field.id] = 'urn:li:person:test';
    } else {
      out[field.id] = SAMPLE_TOKEN;
    }
  }
  return out;
};

test('every provider exposes a probeUrlTemplate and a non-empty fields schema', () => {
  for (const [id, provider] of Object.entries(providerCatalogue)) {
    const creds = provider.apiCredentials;
    assert.equal(
      typeof creds.probeUrlTemplate,
      'string',
      `${id}: template missing`
    );
    assert.ok(creds.probeUrlTemplate.length > 0, `${id}: template is empty`);
    assert.ok(Array.isArray(creds.fields), `${id}: fields is not an array`);
    assert.ok(creds.fields.length > 0, `${id}: fields is empty`);
    for (const field of creds.fields) {
      assert.equal(typeof field.id, 'string');
      assert.equal(typeof field.label, 'string');
      assert.equal(typeof field.type, 'string');
      assert.equal(typeof field.secretId, 'string');
      assert.ok(
        field.secretId.startsWith('secret:'),
        `${id}.${field.id}: secretId must be in the secret:* namespace`
      );
    }
  }
});

test('buildProbeUrl returns null when required credentials are missing', () => {
  for (const [id, provider] of Object.entries(providerCatalogue)) {
    const url = buildProbeUrl({ provider, credentials: {} });
    assert.equal(url, null, `${id}: expected null URL with no credentials`);
  }
});

test('buildProbeUrl returns the interpolated URL when credentials are present', () => {
  for (const [id, provider] of Object.entries(providerCatalogue)) {
    const url = buildProbeUrl({
      provider,
      credentials: sampleCredentials(provider),
    });
    assert.equal(typeof url, 'string', `${id}: expected string URL`);
    assert.ok(!url.includes('{'), `${id}: leftover placeholder in ${url}`);
    assert.ok(!url.includes('}'), `${id}: leftover placeholder in ${url}`);
  }
});

test('Telegram template interpolates the bot token in the path', () => {
  const provider = providerCatalogue.telegram;
  const url = buildProbeUrl({
    provider,
    credentials: { token: SAMPLE_TOKEN },
  });
  assert.equal(
    url,
    `https://api.telegram.org/bot${SAMPLE_TOKEN}/getMe`,
    'telegram URL should embed the token between "bot" and "/getMe"'
  );
  // Regression assert: must not reproduce the broken legacy URL that
  // hard-codes "/bot/getMe" and 404s every time (issue #16 root cause).
  assert.notEqual(url, 'https://api.telegram.org/bot/getMe');
});

test('Meta Graph (WhatsApp + Facebook) template interpolates access_token query param', () => {
  for (const id of ['whatsapp', 'facebook']) {
    const provider = providerCatalogue[id];
    const url = buildProbeUrl({
      provider,
      credentials: { token: SAMPLE_TOKEN },
    });
    assert.ok(
      url.includes(`access_token=${SAMPLE_TOKEN}`),
      `${id}: expected access_token query parameter`
    );
    // Regression assert: must not reproduce the legacy /me URL with no
    // access_token (that path returns 400 OAuthException 2500).
    assert.notEqual(url, 'https://graph.facebook.com/v22.0/me');
  }
});

test('VK template adds &access_token query parameter', () => {
  const provider = providerCatalogue.vk;
  const url = buildProbeUrl({
    provider,
    credentials: { token: SAMPLE_TOKEN },
  });
  assert.ok(url.includes(`access_token=${SAMPLE_TOKEN}`));
  assert.ok(url.includes('v=5.199'));
});

test('buildProbeHeaders fills Authorization for X / LinkedIn / hh / habr-career', () => {
  for (const id of ['x', 'linkedin', 'hh', 'habr-career']) {
    const provider = providerCatalogue[id];
    const headers = buildProbeHeaders({
      provider,
      credentials: { token: SAMPLE_TOKEN },
    });
    assert.equal(
      headers.Authorization,
      `Bearer ${SAMPLE_TOKEN}`,
      `${id}: expected Bearer header`
    );
  }
});

test('buildProbeHeaders fills X-Api-App-Id for SuperJob', () => {
  const provider = providerCatalogue.superjob;
  const headers = buildProbeHeaders({
    provider,
    credentials: { appId: SAMPLE_APP_ID },
  });
  assert.equal(headers['X-Api-App-Id'], SAMPLE_APP_ID);
});

test('buildProbeHeaders returns {} when required credentials are missing', () => {
  const headers = buildProbeHeaders({
    provider: providerCatalogue.x,
    credentials: {},
  });
  assert.deepEqual(headers, {});
});

test('hasRequiredCredentials respects probeRequiresAll and skips optional fields', () => {
  const whatsapp = providerCatalogue.whatsapp;
  // token only (probeRequiresAll = ['token']) is enough.
  assert.equal(hasRequiredCredentials(whatsapp, { token: SAMPLE_TOKEN }), true);
  // No token → not ready.
  assert.equal(
    hasRequiredCredentials(whatsapp, { phoneNumberId: SAMPLE_PHONE }),
    false
  );
});

test('credentialsFromLinks reads secret:* link values into a field-id map', () => {
  const provider = providerCatalogue.telegram;
  const links = [
    {
      id: 'secret:telegram:bot-token',
      tokens: ['secret', 'telegram', 'bot-token'],
      value: SAMPLE_TOKEN,
    },
    {
      id: 'msg:telegram:not-a-secret',
      body: 'noise',
    },
  ];
  const creds = credentialsFromLinks(provider, links);
  assert.deepEqual(creds, { token: SAMPLE_TOKEN });
});

test('interpolate leaves unknown placeholders intact', () => {
  assert.equal(
    interpolate('https://x/{token}/{missing}', { token: 'abc' }),
    'https://x/abc/{missing}'
  );
});

test('connectFirst rows on every guide point at a known provider', () => {
  for (const [section, guide] of Object.entries(connectionGuides)) {
    if (guide.providers.length === 0) {
      assert.equal(
        guide.connectFirst,
        undefined,
        `${section}: empty-providers guide should not declare connectFirst`
      );
      continue;
    }
    assert.ok(guide.connectFirst, `${section}: missing connectFirst`);
    const target = guide.connectFirst.providerId;
    assert.ok(
      providerCatalogue[target],
      `${section}: connectFirst.providerId "${target}" is not in providerCatalogue`
    );
  }
});

test('legacy probeUrl is preserved for backward compatibility but never matches the new template', () => {
  for (const [id, provider] of Object.entries(providerCatalogue)) {
    const legacy = provider.apiCredentials.probeUrl;
    const template = provider.apiCredentials.probeUrlTemplate;
    assert.equal(typeof legacy, 'string', `${id}: legacy probeUrl missing`);
    if (template.includes('{')) {
      assert.notEqual(
        legacy,
        template,
        `${id}: template should differ from legacy probeUrl when it contains placeholders`
      );
    }
  }
});
