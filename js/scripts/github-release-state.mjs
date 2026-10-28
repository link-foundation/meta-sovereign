import { pathToFileURL } from 'node:url';

// Only an explicit 404 means absent. Authentication, rate limits and transport
// failures must never cause the caller to create or silently skip a release.
export async function probeGitHubRelease(
  repository,
  tag,
  { request = fetch, token = process.env.GH_TOKEN } = {}
) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '')) {
    throw new Error('A valid GitHub repository is required');
  }
  const response = await request(
    `https://api.github.com/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`,
    {
      headers: {
        accept: 'application/vnd.github+json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      signal: globalThis.AbortSignal.timeout(15_000),
    }
  );
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`GitHub release state is unknown: HTTP ${response.status}`);
  }
  const release = await response.json();
  if (
    !Number.isInteger(release.id) ||
    release.tag_name !== tag ||
    !Array.isArray(release.assets)
  ) {
    throw new Error('GitHub returned malformed release metadata');
  }
  return release;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  console.log(
    JSON.stringify(
      await probeGitHubRelease(process.env.GITHUB_REPOSITORY, process.argv[2])
    )
  );
}
