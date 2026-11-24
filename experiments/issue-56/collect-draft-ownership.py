"""Preserve the actual parent failures and finite shared-draft verification."""
import hashlib
import json
from pathlib import Path
import subprocess
from evidence_bundle import evidence_context, evidence_logs, verify_evidence, write_entries_archive

root, logs, read = evidence_context(__file__, 'draft-ownership')
verify_evidence(read, {
    'before': ['fail 2', 'Keep the owner’s wording', 'First reviewed wording'],
    'focused': ['pass 37', 'fail 0', 'cancelled 0', 'skipped 0'],
    'format-check': ['All matched files use Prettier code style!'],
    'limits': ['0 over the 1500 line limit'],
    'build': ['Done in'],
}, empty=('lint', 'secrets', 'diff'))
parent = subprocess.check_output(['git', 'rev-parse', 'd517e9d4'], cwd=root).decode().strip()
subprocess.run(['git', 'merge-base', '--is-ancestor', parent, 'HEAD'], cwd=root, check=True)
names = [
    'js/src/automation/drafts.js', 'js/src/automation/runner.js',
    'js/src/automation/run-automation.js', 'js/src/storage/serialized.js',
    'js/src/web/automation-api.js', 'js/tests/draft-ownership.test.js',
    'js/tests/automations.test.js', 'js/tests/chat-answer-model.test.js',
    'docs/case-studies/issue-56/draft-ownership.md',
    'experiments/issue-56/collect-draft-ownership.py',
    'experiments/issue-56/evidence_bundle.py', *evidence_logs(root, 'draft-ownership'),
]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
component = 'js/src/automation/drafts.js'
entries[f'before/{component}'] = subprocess.check_output(['git', 'show', f'{parent}:{component}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(
    parent=parent, criterion='QA20', acceptance=False,
    acceptedCriteria=83, unfinishedCriteria=35, focusedTests=37,
    sourceIdentities=['hh', 'telegram', 'vk', 'email', 'whatsapp'],
    liveProvider=False, hostedVerificationPending=True,
    bundleSha256=hashlib.sha256((root / 'js/src/web/app.min.js').read_bytes()).hexdigest(),
), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/draft-ownership.tar.gz', entries)
