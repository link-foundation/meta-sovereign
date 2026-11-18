"""Preserve fixture boundary regressions and exact hosted security findings."""
import json
import subprocess
from evidence_bundle import evidence_context, evidence_logs, changed_sources, write_entries_archive

root, logs, read = evidence_context(__file__, 'mcp-fixture')
for name, fragments in {
    'before': ['tests 9', 'pass 4', 'fail 5', 'cancelled 0'],
    'focused': ['tests 9', 'pass 9', 'fail 0', 'cancelled 0'],
    'generators-before': ['"escaped":false', '3 !== 0', 'Owned temporary fixture files removed'],
    'generators-after': ['"escaped":true', 'Owned temporary fixture files removed'],
    'syntax': ['Compiled application-answer-context-mcp.mjs',
               'Compiled application-salary-mcp.mjs', 'Compiled current search-route MCP runner'],
    'format-check': ['All matched files use Prettier code style!'],
}.items():
    assert all(fragment in read(name) for fragment in fragments), name
assert read('generators-before').count('"escaped":false') == 3
assert read('generators-after').count('"escaped":true') == 3
for name in ['lint-final', 'secrets', 'diff']:
    assert not read(name).strip(), name
names = changed_sources(root) + evidence_logs(root, 'mcp-fixture')
names += ['experiments/issue-56/evidence_bundle.py',
          'ci-logs/security-aa095a98-job135105297121.log',
          'ci-logs/security-aa095a98-44390156219.log',
          'ci-logs/security-aa095a98-sarif/javascript.sarif']
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
for name in [
    'experiments/issue-56/mcp-inspection-code.mjs',
    'experiments/issue-56/application-answer-context-mcp-runner.mjs',
    'experiments/issue-56/application-search-route-mcp-runner.mjs',
    'experiments/issue-56/application-collection-mcp-runner.mjs',
    'experiments/issue-56/application-preview-mcp-runner.mjs',
    'experiments/issue-56/application-salary-batch-mcp-bundle.mjs',
    'js/tests/mcp-inspection-code.test.js',
]:
    entries[f'before/{name}'] = subprocess.check_output(
        ['git', 'show', f'aa095a98:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(
    parent='aa095a981ff47e0c2e099f0fd4cc6b34290da10d',
    hostedRun=44390156219, hostedJob=135105297121,
    focusedBefore=dict(passed=4, failed=5), focusedAfter=dict(passed=9, failed=0),
    generatorsBefore=dict(escaped=0, unescaped=3),
    generatorsAfter=dict(escaped=3, unescaped=0),
    localFullSuite=False, localBrowserOpened=False, providerRequests=0,
    codeqlExceptionAdded=False, hostedVerificationPending=True,
    acceptance=False, acceptedCriteria=88, unfinishedCriteria=30,
), indent=2) + '\n').encode()
write_entries_archive(
    root / 'docs/case-studies/issue-56/data/mcp-fixture-serialization.tar.gz', entries)
