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
    read_literal_tests, read_reference_contracts,
)

root = Path(__file__).resolve().parents[2]
revision, slug = sys.argv[1:]
sha = subprocess.check_output(['git', 'rev-parse', revision], cwd=root).decode().strip()
entries = {}
runs = read_workflows(root, sha, slug, entries)
source = source_reader(root, sha, entries)
registration = json.loads(source('js/scripts/browser-checks.json'))
selected = {'node': ('Checks and release', 'Test (node on ubuntu-26.04)')}
for group in ['forms-reader', 'forms-learning']:
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
    'forms-review-sessions',
], source, raw['node'])

for path in ['js/tests/e2e-forms-reader-browser.mjs',
             'js/tests/e2e-forms-watcher-browser.mjs',
             'js/tests/helpers/e2e-form-learning.mjs',
             'js/tests/helpers/e2e-form-learning-gestures.mjs',
             'examples/forms-detached-review.mjs']:
    source(path)
runner = source('js/scripts/run-browser-checks.mjs')
assert 'timeout: 180_000' in runner
receipts = {}
for group in ['forms-reader', 'forms-learning']:
    shard = registration.index(group) % 4 + 1
    for engine in ['chromium', 'webkit']:
        lines = raw[f'{engine}-{shard}']
        ends = [n for n, line in enumerate(lines, 1)
                if re.search(rf'Completed {group} in \d+ms; exit 0\s*$', line)]
        assert len(ends) == 1, (group, engine, ends)
        end = ends[0]
        start = max(n for n, line in enumerate(lines[:end], 1)
                    if f'Browser check: {group}' in line)
        block = lines[start - 1:end]
        assert any(f'[e2e-forms-reader] OK ({engine})' in line for line in block)
        assert not any('SKIP:' in line for line in block)
        if group == 'forms-learning':
            assert any('[forms-scenario] verifyFormLearningUi started' in line for line in block)
            assert any(re.search(r'\[forms-scenario\] verifyFormLearningUi \d+\s*$', line)
                       for line in block)
        if group == 'forms-reader' and engine == 'chromium':
            # gh log lines prefix each physical JSON line with job, step and UTC time.
            bodies = [re.sub(r'^.*?\d{4}-\d\d-\d\dT[\d:.]+Z ', '', line)
                      for line in block]
            text = '\n'.join(bodies)
            found = []
            for match in re.finditer(r'(?m)^\{\s*$', text):
                try:
                    value, _ = json.JSONDecoder().raw_decode(text[match.start():])
                except json.JSONDecodeError:
                    continue
                if value.get('initiatingCliExited') is True:
                    found.append(value)
            assert len(found) == 1
            receipt = found[0]
            assert receipt['ok'] and receipt['submits'] == 1
            before = receipt['beforeSubmit']
            assert before['answerLearning']['tracked'] == 2
            assert before['answerLearning']['saved'] == 0
            stable = receipt['stableBeforeSend']['answerLearning']
            assert stable['saved'] == 1 and stable['last']['kind'] == 'stable-owner-edit'
            assert receipt['reusedWatcher']['watcher']['pid'] == before['watcher']['pid']
            assert receipt['history']['answerLearning']['saved'] == 2
            assert receipt['history']['answerLearning']['failed'] == 0
            assert receipt['stopped']['state'] == 'stopped'
            assert receipt['savedHistory']['source'] == 'saved-checkpoints'
            assert len(receipt['rules']) == 2
            assert all(not answer['approved'] and answer['count'] == 1
                       for rule in receipt['rules'] for answer in rule['answers'])
            assert '"token":' not in json.dumps(receipt)
            entries['receipts/detached-learning.json'] = (json.dumps(receipt, indent=2) + '\n').encode()
        receipts[f'{engine}/{group}'] = dict(startLine=start, completedLine=end,
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
