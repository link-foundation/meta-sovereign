"""Bind submission and full-minute detached learning to exact-source execution."""
from pathlib import Path
import json
import re
import subprocess
import sys
import tarfile
from evidence_bundle import write_entries_archive
from hosted_evidence import (
    read_workflows, read_jobs, source_reader, read_catalog_audit,
    read_literal_tests, read_reference_contracts, read_detached_learning,
    browser_group_block,
)

root = Path(__file__).resolve().parents[2]
revision, slug = sys.argv[1:]
sha = subprocess.check_output(['git', 'rev-parse', revision], cwd=root).decode().strip()
entries = {}
runs = read_workflows(root, sha, slug, entries)
source = source_reader(root, sha, entries)
registration = json.loads(source('js/scripts/browser-checks.json'))
selected = {'node': ('Checks and release', 'Test (node on ubuntu-26.04)')}
groups = ['forms-reader', 'forms-learning', 'forms-watchers']
for group in groups:
    shard = registration.index(group) % 4 + 1
    for engine in ['chromium', 'webkit']:
        selected[f'{engine}-{shard}'] = ('Checks and release',
            f'Browser e2e ({engine}, shard {shard}/4)')
raw, jobs = read_jobs(root, runs, slug, selected, entries)
catalog_path = 'experiments/issue-56/form-learning-evidence.json'
catalog = json.loads((root / catalog_path).read_text())
read_catalog_audit(root, sha, 'form-learning-criteria', catalog, source, entries)
tests = read_literal_tests([
    'forms-learning', 'forms-learning-document', 'forms-monitor-document',
    'forms-monitor', 'forms-watchers', 'forms-watch-store', 'forms-local-channel',
    'forms-review-sessions', 'forms-private-profile',
], source, raw['node'])

for path in ['js/tests/e2e-forms-reader-browser.mjs',
             'js/tests/e2e-forms-watcher-browser.mjs',
             'js/tests/helpers/e2e-form-learning.mjs',
             'js/tests/helpers/e2e-form-learning-gestures.mjs',
             'js/src/forms/private-profile.js',
             'js/src/automation/question-profile-source.js',
             'examples/forms-detached-review.mjs']:
    source(path)
runner = source('js/scripts/run-browser-checks.mjs')
assert 'timeout: 180_000' in runner
receipts = {}
for group in groups:
    shard = registration.index(group) % 4 + 1
    for engine in ['chromium', 'webkit']:
        lines = raw[f'{engine}-{shard}']
        start, end, block = browser_group_block(lines, group)
        if group != 'forms-watchers':
            assert any(f'[e2e-forms-reader] OK ({engine})' in line for line in block)
        if group == 'forms-learning':
            assert any('[forms-scenario] verifyFormLearningUi started' in line for line in block)
            assert any(re.search(r'\[forms-scenario\] verifyFormLearningUi \d+\s*$', line)
                       for line in block)
        if group == 'forms-watchers':
            receipt = read_detached_learning('\n'.join(block))
            entries[f'receipts/detached-learning-{engine}.json'] = (json.dumps(receipt, indent=2) + '\n').encode()
        receipts[f'{engine}/{group}'] = dict(startLine=start, completedLine=end,
                                            runtime='chromium-cdp' if group == 'forms-watchers' else engine,
                                            liveProvider=False)

with tarfile.open(root / 'docs/case-studies/issue-56/data/forms-answer-learning.tar.gz') as tar:
    before = tar.extractfile('ci-logs/forms-learning-browser-before.log').read().decode()
    assert 'baseline lacks stable owner edit and submitted answer learning' in before
references = read_reference_contracts(root, {None: ['ci-logs/qa19-reference-forms.json']},
    entries, 'fa0991b8c2d0896fb3b4be6c69947f0590094b15')
for name in [catalog_path, 'experiments/issue-56/collect-form-learning-hosted.py',
             'experiments/issue-56/hosted_evidence.py',
             'experiments/issue-56/evidence_bundle.py',
             'docs/case-studies/issue-56/form-learning-criteria-audit.md']:
    entries[name] = (root / name).read_bytes()
entries['metadata.json'] = (json.dumps(dict(sha=sha, criterion='QA23', jobs=jobs,
    workflows=5, namedTests=tests, browserReceipts=receipts,
    referenceContracts=references, acceptance=False, liveProvider=False), indent=2) + '\n').encode()
write_entries_archive(root / f'docs/case-studies/issue-56/data/form-learning-hosted-{slug}.tar.gz', entries)
