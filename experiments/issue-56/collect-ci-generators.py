"""Keep the exact CI findings and finite source-generation checks."""
import json
import subprocess
from evidence_bundle import evidence_context, evidence_logs, changed_sources, write_entries_archive

root, logs, read = evidence_context(__file__, 'ci-generators')
assert all(value in read('before') for value in ('tests 6', 'pass 5', 'fail 1', 'cancelled 0'))
assert all(value in read('focused') for value in ('tests 6', 'pass 6', 'fail 0', 'cancelled 0'))
assert 'Multiple changesets' in read('changesets-before')
assert 'Found 1 changeset file(s)' in read('changesets-after')
assert 'Changeset validation passed' in read('changesets-after')
assert all(value in read('syntax') for value in ('Compiled application-answer-context-mcp.mjs',
    'Compiled application-salary-mcp.mjs', 'Compiled current search-route MCP runner'))
assert not read('lint-final').strip() and not read('secrets').strip() and not read('diff').strip()
assert 'All matched files use Prettier code style!' in read('format-check')
report = 'ci-logs/duplication-ci-generators/jscpd-report.json'
assert json.loads((root / report).read_text())['statistics']['total']['percentage'] <= 6.5
names = changed_sources(root)
names += [report, '.jscpd.json', 'experiments/issue-56/evidence_bundle.py',
          'ci-logs/security-37bbae0d-44386603581.log',
          'ci-logs/security-37bbae0d-sarif/javascript.sarif',
          'ci-logs/security-37bbae0d-findings.json',
          'ci-logs/changesets-37bbae0d-job135093422826.log',
          *evidence_logs(root, 'ci-generators')]
names = [name for name in names if (root / name).is_file()]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
for name in ['experiments/issue-56/application-answer-context-mcp-runner.mjs',
             '.changeset/application-search-route.md', '.changeset/application-background-status.md',
             '.changeset/birthday-history-selection.md', '.changeset/visible-browser-defaults.md']:
    entries[f'before/{name}'] = subprocess.check_output(['git', 'show', f'2a77ef49:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(parent='2a77ef49', failedHostedHead='37bbae0d',
    acceptance=False, acceptedCriteria=88, unfinishedCriteria=30,
    hostedVerificationPending=True, codeqlExceptionAdded=False), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-generators.tar.gz', entries)
