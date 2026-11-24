import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CHECKSUM_ASSET_NAME,
  PROVENANCE_ASSET_NAME,
  assetHref,
  pickDesktopRelease,
  resolveDownloads,
} from '../../js/src/web/download/downloads.js';

const releases = JSON.parse(await readFile(process.argv[2], 'utf8'));
const release = pickDesktopRelease(releases);
assert.ok(release, 'Public metadata must include a published desktop release');
const downloads = resolveDownloads(release);
const published = new Set(
  release.assets
    .filter((asset) => asset.state === 'uploaded' && asset.size > 0)
    .map((asset) => asset.browser_download_url)
);
for (const entry of downloads) {
  assert.ok(published.has(entry.href), `Public asset absent: ${entry.id}`);
}
for (const name of [CHECKSUM_ASSET_NAME, PROVENANCE_ASSET_NAME]) {
  assert.ok(
    published.has(assetHref(release, name)),
    `Public metadata absent: ${name}`
  );
}
console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      releaseCount: releases.length,
      tag: release.tag_name,
      releaseUrl: release.html_url,
      available: downloads.map(({ id, href }) => ({ id, href })),
      checksums: assetHref(release, CHECKSUM_ASSET_NAME),
      provenance: assetHref(release, PROVENANCE_ASSET_NAME),
      installerDownloads: 0,
    },
    null,
    2
  )
);
