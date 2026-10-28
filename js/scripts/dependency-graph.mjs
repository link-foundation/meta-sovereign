import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export async function checkDependencyGraph(env = process.env, request = fetch) {
  const repository = env.GITHUB_REPOSITORY;
  const base = env.BASE_SHA || env.GITHUB_SHA;
  const head = env.HEAD_SHA || env.GITHUB_SHA;
  if (!repository || !base || !head) {
    throw new Error('Repository and comparison SHAs are required');
  }
  const response = await request(
    `https://api.github.com/repos/${repository}/dependency-graph/compare/${base}...${head}`,
    {
      headers: {
        authorization: `Bearer ${env.GH_TOKEN}`,
        accept: 'application/vnd.github+json',
      },
      signal: globalThis.AbortSignal.timeout(15_000),
    }
  );
  if (response.ok) {
    return true;
  }
  if (response.status !== 403) {
    throw new Error(
      `Dependency graph state is unknown: HTTP ${response.status}`
    );
  }
  const message = `Dependency comparison is unavailable (HTTP 403). A repository administrator must enable Dependency graph and grant workflow access at https://github.com/${repository}/settings/security_analysis. The API does not distinguish disabled configuration from denied access.`;
  if (env.REQUIRE_GRAPH === '1') {
    throw new Error(message);
  }
  console.log(
    `::notice::${message} PR dependency review cannot run; lockfile audits remain required.`
  );
  return false;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const enabled = await checkDependencyGraph();
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `enabled=${enabled}\n`);
  }
}
