#!/usr/bin/env node
// Exchange an OIDC token before spending time on a release. Never print tokens.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function preflightNpm(env, request = fetch) {
  if (
    !env.ACTIONS_ID_TOKEN_REQUEST_URL ||
    !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
  ) {
    throw new Error(
      'npm OIDC unavailable: grant id-token: write to the release preflight job'
    );
  }
  const url = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);
  url.searchParams.set('audience', 'npm:registry.npmjs.org');
  const jwt = await request(url, {
    headers: { authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` },
    signal: globalThis.AbortSignal.timeout(15_000),
  });
  if (!jwt.ok) {
    throw new Error(
      `npm OIDC identity request is unknown (HTTP ${jwt.status})`
    );
  }
  const identity = await jwt.json();
  if (typeof identity.value !== 'string' || !identity.value) {
    throw new Error('Malformed OIDC identity response');
  }
  const result = await request(
    `https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/${encodeURIComponent(env.PACKAGE_NAME)}`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${identity.value}` },
      signal: globalThis.AbortSignal.timeout(15_000),
    }
  );
  if (!result.ok) {
    await result.arrayBuffer();
    throw new Error(
      `npm publisher exchange ${result.status === 401 || result.status === 403 || result.status === 404 ? 'refused' : 'unknown'} (HTTP ${result.status}). Configure this repository and release.yml as the package trusted publisher at npm; a never-published package needs an initial maintainer publication. No refusal is retried.`
    );
  }
  const data = await result.json();
  if (typeof data.token !== 'string' || !data.token) {
    throw new Error('Malformed npm exchange response');
  }
  return 'npm OIDC package exchange verified; short-lived token discarded';
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.env.PREFLIGHT_MODE !== 'release') {
    console.log(
      '::notice::PR validation: publication credentials are not requested. Main releases must pass an npm OIDC exchange before building.'
    );
  } else {
    const { name } = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url))
    );
    console.log(await preflightNpm({ ...process.env, PACKAGE_NAME: name }));
  }
}
