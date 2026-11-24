"""Collect finite startup evidence while leaving native/full dependency proof open."""
import json
import subprocess
from evidence_bundle import (
    changed_sources, evidence_context, evidence_logs, verify_evidence,
    write_entries_archive,
)

root, logs, read = evidence_context(__file__, 'browser-preparation')
verify_evidence(read, {
    'parent': ['ℹ tests 2', 'ℹ pass 0', 'ℹ fail 2'],
    'owners-parent': ['ℹ tests 6', 'ℹ pass 0', 'ℹ fail 6'],
    'focused': ['ℹ tests 18', 'ℹ pass 18', 'ℹ fail 0'],
    'compatibility': ['ℹ tests 92', 'ℹ pass 92', 'ℹ fail 0'],
    'import-final': ['ℹ tests 3', 'ℹ pass 3', 'ℹ fail 0'],
    'launch-final': ['ℹ tests 1', 'ℹ pass 1', 'ℹ fail 0'],
    'format-final': ['All matched files use Prettier code style!'],
})
names = set(changed_sources(root))
names.update(evidence_logs(root, 'browser-preparation'))
names.update({
    'ci-logs/ci-4319-node-macos-4.log',
    'ci-logs/vk-desktop-reference-README.md',
    'ci-logs/desktop-runner-reference-requirements-full.md',
    'ci-logs/desktop-dependency-reference-installer.js',
    'ci-logs/desktop-dependency-reference-runner.js',
    'ci-logs/vk-desktop-reference-main.source',
    'js/src/server/runner-transport.js',
    'js/src/server/worker-client.js',
    'js/tests/runner-transport.test.js',
    'experiments/issue-56/evidence_bundle.py',
    'experiments/issue-56/previous-module.mjs',
})
entries = {name: (root / name).read_bytes() for name in sorted(names)}
parent = 'af27bb6d591e0b8d0149750ae57e96eaf806c0b2'
for name in [
    'js/src/cv/browser.js', 'js/src/cv/persistent-browser.js',
    'js/src/assignments/read-page.js', 'js/src/forms/review-sessions.js',
    'js/src/jobs/login-service.js', 'js/src/sources/auto-import/manager.js',
]:
    entries[f'before/{name}'] = subprocess.check_output(
        ['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps({
    'parent': parent,
    'reference': 'konard/vk-bot-desktop@8fbf3b7c42fd8e995ef137cab9b9653a7dc9b1a1',
    'realDownloadRunLocally': False,
    'nativeColdCacheProof': 'required in hosted CI',
    'acceptedInventoryRows': [], 'issueComplete': False,
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/browser-preparation.tar.gz', entries)
