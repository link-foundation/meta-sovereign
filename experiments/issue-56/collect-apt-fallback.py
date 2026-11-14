"""Preserve the actual-parent mirror loss and focused CI setup correction."""
import base64
from pathlib import Path
from evidence_bundle import bundle, evidence_logs

root = Path(__file__).resolve().parents[2]
read = lambda name: (root / f'ci-logs/apt-fallback-{name}.log').read_text()
assert 'fail 2' in read('before') and 'retaining Azure failover' in read('before')
assert 'pass 27' in read('after') and 'fail 0' in read('after')
assert not read('lint') and 'All workflows enforce' in read('workflow')
reference = root / 'ci-logs/apt-fallback-runner-source.sh'
reference.write_bytes(base64.b64decode((root / 'ci-logs/apt-fallback-runner-base64.txt').read_text()))
assert 'priority:1' in reference.read_text() and 'priority:2' in reference.read_text()
parent = '12423a3757b470ce3e7c04e35bf53025c5a48a09'
bundle(root, [
    '.changeset/visible-browser-defaults.md',
    'docs/case-studies/issue-56/ci-apt-fallback.md',
    'experiments/issue-56/collect-apt-fallback.py',
    'js/scripts/prepare-browser-apt.mjs',
    'js/tests/ci-browser-apt.test.js',
    *evidence_logs(root, 'apt-fallback'),
    str(reference.relative_to(root)), 'ci-logs/apt-fallback-manual.html',
    'ci-logs/conversation-history-parent-ci-latest.json',
    'ci-logs/conversation-history-parent-chromium.log',
    'ci-logs/conversation-history-parent-pages.log',
    'ci-logs/conversation-history-parent-webkit.log',
    'ci-logs/text-reply-parent-security.log',
], 'docs/case-studies/issue-56/data/apt-fallback.tar.gz', {
    'parent': parent, 'before_failures': 2, 'focused_checks': 27,
    'remaining': 'Exact new-head hosted network/browser verification and every unchecked issue criterion.',
}, 'issue-56-ci-apt-fallback/*.png', before={
    'js/scripts/prepare-browser-apt.mjs': parent,
})
