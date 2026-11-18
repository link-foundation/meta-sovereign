"""Keep the exact hosted duplication failure and unchanged behavioral checks."""
import json
import subprocess
from evidence_bundle import evidence_context, evidence_logs, changed_sources, write_entries_archive

root, logs, read = evidence_context(__file__, 'duplication-consent')
assert 'pass 151' in read('focused') and 'fail 0' in read('focused')
for mode, passed, failed in [('answer', 10, 44), ('send', 5, 28)]:
    parent_log = read(f'{mode}-parent')
    assert all(f'{key} {value}' in parent_log for key, value in [
        ('pass', passed), ('fail', failed), ('cancelled', 0)])
    assert parent_log.count('AssertionError [ERR_ASSERTION]') == failed
for name in ['lint', 'secrets', 'diff']:
    assert not read(name).strip(), name
assert 'All matched files use Prettier code style!' in read('format-check')
reports = [f'ci-logs/duplication-{name}/jscpd-report.json'
           for name in ['fa1e21c7', 'consent-after']]
before, after = [json.loads((root / name).read_text())['statistics']['total']
                 for name in reports]
assert before['percentage'] > 6.5 and after['percentage'] <= 6.5
assert json.loads((root / '.jscpd.json').read_text())['threshold'] == 6.5
names = changed_sources(root) + reports + evidence_logs(root, 'duplication-consent') + [
    'ci-logs/hosted-fa1e21c7-lint.log', 'ci-logs/hosted-fa1e21c7-lint-job.json',
    'ci-logs/duplication-fa1e21c7.log', 'ci-logs/duplication-consent-source-review.diff',
    'experiments/issue-56/evidence_bundle.py', '.jscpd.json',
    'experiments/issue-56/consent-browser-answer-parent.mjs',
    'experiments/issue-56/consent-browser-send-parent.mjs',
    'experiments/issue-56/previous-module.mjs']
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
for name in changed_sources(root):
    if name.endswith(('.js', '.mjs')) and subprocess.run(
            ['git', 'cat-file', '-e', f'fa1e21c7:{name}'], cwd=root,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
        entries[f'before/{name}'] = subprocess.check_output(
            ['git', 'show', f'fa1e21c7:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(parent='fa1e21c775e8351af1c333b1ab16daaa904a4142',
    acceptance=False, acceptedCriteria=88, unfinishedCriteria=30,
    before=before, after=after, productionChanged=False), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-consent-duplication.tar.gz', entries)
