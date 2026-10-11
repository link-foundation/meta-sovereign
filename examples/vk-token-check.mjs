#!/usr/bin/env node
/**
 * Check what a VK token you already hold can still do (issue #32).
 *
 *   VK_ACCESS_TOKEN=... node examples/vk-token-check.mjs
 *   node examples/vk-token-check.mjs --sources   # ranked client list only
 *
 * Uses three documented read-only calls (users.get,
 * account.getAppPermissions, messages.getConversations count=1) against
 * api.vk.ru. The token is never written anywhere or printed.
 */

import {
  inspectVkToken,
  rankVkTokenSources,
  VK_TOKEN_SOURCES_PROBED_AT,
} from '../js/src/sources/vk-auth.js';

if (process.argv.includes('--sources')) {
  console.log(
    `VK clients whose OAuth gate was open on ${VK_TOKEN_SOURCES_PROBED_AT}:`
  );
  for (const entry of rankVkTokenSources({ includeThirdParty: true })) {
    console.log(
      `  ${String(entry.clientId).padStart(8)}  ${entry.recommendation.padEnd(8)}  ${entry.publisher.padEnd(11)}  ${entry.name}`
    );
  }
  process.exit(0);
}

if (!process.env.VK_ACCESS_TOKEN) {
  console.error('Set VK_ACCESS_TOKEN first (or pass --sources).');
  process.exit(2);
}

const report = await inspectVkToken({});
console.log(JSON.stringify(report, null, 2));
process.exit(report.verdict === 'invalid' ? 1 : 0);
