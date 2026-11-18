import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DOWNLOAD_OPTIONS,
  CHECKSUM_ASSET_NAME,
  PROVENANCE_ASSET_NAME,
  RELEASES_URL,
  assetHref,
  assetNameFor,
  pickDesktopRelease,
  resolveDownloads,
} from '../src/web/download/downloads.js';
import { loadDesktopRelease } from '../src/web/download/model.js';
import {
  landingRelease,
  unfinishedLandingRelease,
} from '../../experiments/issue-56/desktop-landing-fixture.mjs';

test('unfinished uploads never replace the previous downloadable desktop release', () => {
  const ready = landingRelease('1.2.2');
  assert.equal(pickDesktopRelease([unfinishedLandingRelease(), ready]), ready);
  assert.equal(pickDesktopRelease([unfinishedLandingRelease()]), null);
  assert.ok(
    resolveDownloads(unfinishedLandingRelease()).every(
      (row) => row.href === null
    )
  );
  assert.equal(
    pickDesktopRelease([
      {
        ...ready,
        tag_name: 'unversioned',
        assets: [
          { ...ready.assets[0], name: assetNameFor(DOWNLOAD_OPTIONS[0], null) },
        ],
      },
    ]),
    null
  );
});

test('partial releases retain available platforms and refuse incomplete binaries and metadata', () => {
  for (const change of [
    { state: 'starter' },
    { state: undefined },
    { size: 0 },
    { browser_download_url: '' },
    { browser_download_url: 'javascript:alert(1)' },
  ]) {
    const release = landingRelease();
    const unavailable = new Set([
      assetNameFor(DOWNLOAD_OPTIONS[0], '1.2.3'),
      CHECKSUM_ASSET_NAME,
      PROVENANCE_ASSET_NAME,
    ]);
    release.assets = release.assets.map((row) =>
      unavailable.has(row.name) ? { ...row, ...change } : row
    );
    const downloads = resolveDownloads(release);
    assert.equal(downloads[0].href, null);
    assert.equal(
      downloads.filter((row) => row.href).length,
      DOWNLOAD_OPTIONS.length - 1
    );
    assert.equal(assetHref(release, CHECKSUM_ASSET_NAME), RELEASES_URL);
    assert.equal(assetHref(release, PROVENANCE_ASSET_NAME), RELEASES_URL);
    assert.equal(pickDesktopRelease([release]), release);
  }
});

test('cached release metadata retains upload state and rejects legacy unverified assets', async () => {
  let value = null;
  const storage = {
    getItem: () => value,
    setItem: (_key, next) => {
      value = next;
    },
  };
  const fetchImpl = async () => ({
    ok: true,
    json: async () => [unfinishedLandingRelease(), landingRelease('1.2.2')],
  });
  const first = await loadDesktopRelease({ fetchImpl, storage, now: 1000 });
  assert.equal(first.release.tag_name, 'v1.2.2');
  const cached = JSON.parse(value);
  assert.equal(cached.releases[0].assets[0].state, 'starter');
  const second = await loadDesktopRelease({
    fetchImpl: () => assert.fail('Cache should be reused'),
    storage,
    now: 1001,
  });
  assert.equal(second.release.tag_name, 'v1.2.2');
  const legacy = landingRelease();
  legacy.assets.forEach((row) => {
    delete row.state;
  });
  value = JSON.stringify({ at: 1000, releases: [legacy] });
  assert.equal(
    (await loadDesktopRelease({ fetchImpl, storage, now: 1002 })).release
      .tag_name,
    'v1.2.2'
  );
});
