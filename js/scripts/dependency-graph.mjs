import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const TRANSIENT = new Set([408, 429, 500, 502, 503, 504]);
const sleep = (ms) =>
  new Promise((resolve) => globalThis.setTimeout(resolve, ms));
const requestGraph = async (url, headers, request, report, wait) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    let response;
    try {
      response = await request(url, {
        headers,
        signal: globalThis.AbortSignal.timeout(15000),
      });
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }
      // Do not print transport errors, which can contain request headers.
    }
    if (response && !TRANSIENT.has(response.status)) {
      return response;
    }
    if (attempt === 2) {
      return response;
    }
    report(
      `::notice::Dependency graph request: ${response ? `HTTP ${response.status}` : 'transport unavailable'}; retry ${attempt + 1}/2.`
    );
    await wait(1000 * (attempt + 1));
  }
};

export async function checkDependencyGraph(
  env = process.env,
  request = fetch,
  report = console.log,
  wait = sleep
) {
  const repository = env.GITHUB_REPOSITORY;
  const base = env.BASE_SHA || env.GITHUB_SHA;
  const head = env.HEAD_SHA || env.GITHUB_SHA;
  if (!repository || !base || !head) {
    throw new Error('Repository and comparison SHAs are required');
  }
  const response = await requestGraph(
    `https://api.github.com/repos/${repository}/dependency-graph/compare/${base}...${head}`,
    {
      authorization: `Bearer ${env.GH_TOKEN}`,
      accept: 'application/vnd.github+json',
    },
    request,
    report,
    wait
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
  report(
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
