import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const repository = resolve(import.meta.dirname, '../..');

const audited = (result, exceptions, root) => {
  const location = result.locations?.[0]?.physicalLocation;
  const path = location?.artifactLocation?.uri;
  const entry = exceptions.find(
    (item) => item.rule === result.ruleId && item.path === path
  );
  if (!entry) {
    return false;
  }
  const source = readFileSync(join(root, path), 'utf8');
  const digest = createHash('sha256').update(source).digest('hex');
  const line = source.split('\n')[location.region?.startLine - 1]?.trim();
  return Boolean(
    entry.reason && entry.test && entry.sha256 === digest && entry.line === line
  );
};

const checkRun = (run, file) => {
  if (run.tool?.driver?.name !== 'CodeQL' || !Array.isArray(run.results)) {
    throw new Error(`Missing CodeQL results: ${file}`);
  }
  if (
    run.invocations?.some(
      (invocation) => invocation.executionSuccessful === false
    )
  ) {
    throw new Error(`CodeQL execution failed: ${file}`);
  }
};

const describeFinding = (result, file) => {
  const location = result.locations?.[0]?.physicalLocation;
  return `${result.ruleId ?? 'unknown rule'} at ${location?.artifactLocation?.uri ?? file}:${location?.region?.startLine ?? 1}`;
};

/** The analyze action uploads findings successfully; enforce its SARIF too. */
export const checkCodeQLResults = (
  directory,
  { exceptions = [], root = repository } = {}
) => {
  if (!directory) {
    throw new Error('Missing CodeQL SARIF directory');
  }
  const files = readdirSync(directory, { recursive: true }).filter((file) =>
    file.endsWith('.sarif')
  );
  if (!files.length) {
    throw new Error('No CodeQL SARIF reports produced');
  }
  const findings = [];
  let accepted = 0;
  for (const file of files) {
    const report = JSON.parse(readFileSync(join(directory, file), 'utf8'));
    if (
      report.version !== '2.1.0' ||
      !Array.isArray(report.runs) ||
      !report.runs.length
    ) {
      throw new Error(`Invalid CodeQL SARIF: ${file}`);
    }
    for (const run of report.runs) {
      checkRun(run, file);
      for (const result of run.results) {
        if (audited(result, exceptions, root)) {
          accepted += 1;
          continue;
        }
        findings.push(describeFinding(result, file));
      }
    }
  }
  if (findings.length) {
    throw new Error(
      `CodeQL reported ${findings.length} unresolved findings:\n${findings.join('\n')}`
    );
  }
  return { reports: files.length, auditedFalsePositives: accepted };
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const exceptions = JSON.parse(
      readFileSync(
        join(repository, '.github/codeql/audited-findings.json'),
        'utf8'
      )
    );
    console.log(
      JSON.stringify(checkCodeQLResults(process.argv[2], { exceptions }))
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
