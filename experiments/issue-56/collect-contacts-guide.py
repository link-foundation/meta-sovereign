"""Preserve exact link failure and bounded rechecks without anonymous cookies."""
import json
from pathlib import Path
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
log = root / 'ci-logs/links-44129087291.log'
assert len(log.read_text().splitlines()) == 745
assert '* [404]' in log.read_text() and '* [503]' in log.read_text()
entries = {str(log.relative_to(root)): log.read_bytes()}
responses = {}
for name in [
    'apple-contacts-old', 'apple-contacts-canonical',
    'apple-contacts-export-current', 'apple-contacts-export-guide',
    'apple-contacts-current-us', 'apple-contacts-export-fresh',
    'apple-contacts-export-uk', 'apple-contacts-export-mac',
    'telegram-reference-recheck',
]:
    file = root / f'ci-logs/{name}.headers'
    lines = file.read_text().splitlines()
    responses[name] = [line for line in lines if line.startswith('HTTP/')]
    entries[str(file.relative_to(root))] = ('\n'.join(
        line for line in lines if not line.lower().startswith('set-cookie:')
    ) + '\n').encode()
assert ' 404 ' in responses['apple-contacts-old'][-1]
assert ' 200' in responses['telegram-reference-recheck'][-1]
for name in ['docs/CONTACTS-IMPORT.md',
             'docs/case-studies/issue-56/ci-contacts-guide.md',
             'experiments/issue-56/collect-contacts-guide.py']:
    entries[name] = (root / name).read_bytes()
entries['source.diff'] = subprocess.check_output(
    ['git', 'diff', '--', 'docs/CONTACTS-IMPORT.md'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(
    precedingHead='b5999ae503827207b8ffe01d8f11fe80b1109048',
    run=44129087291, responses=responses, liveProvider=False,
    hostedReplacementPending=True, acceptedCriteria=82, unfinishedCriteria=36,
), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-contacts-guide.tar.gz', entries)
