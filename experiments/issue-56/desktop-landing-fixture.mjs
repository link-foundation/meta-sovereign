import { expectedReleaseAssets } from '../../js/src/web/download/downloads.js';

export const landingRelease = (version = '1.2.3') => ({
  tag_name: `v${version}`,
  html_url: `https://github.com/link-foundation/meta-sovereign/releases/tag/v${version}`,
  draft: false,
  prerelease: false,
  assets: expectedReleaseAssets(version).map((name) => ({
    name,
    state: 'uploaded',
    size: 1024,
    browser_download_url: `https://github.com/link-foundation/meta-sovereign/releases/download/v${version}/${name}`,
  })),
});

/** GitHub documents starter assets left by a failed upstream upload. */
export const unfinishedLandingRelease = () => ({
  ...landingRelease(),
  assets: landingRelease().assets.map((asset) => ({
    ...asset,
    state: 'starter',
    size: 0,
  })),
});

export const partialLandingRelease = () => ({
  ...landingRelease(),
  assets: landingRelease().assets.map((asset, index) =>
    index === 0 || asset.name.endsWith('.txt')
      ? { ...asset, state: 'starter', size: 0 }
      : asset
  ),
});
