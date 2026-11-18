"""Preserve finite VD13 evidence; hosted acceptance remains explicitly pending."""
import json
import subprocess
from pathlib import Path
from evidence_bundle import changed_sources, evidence_logs, write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert 'pass 41' in (logs / 'vk-token-node-final.log').read_text()
assert json.loads((logs / 'vk-token-native-before.log').read_text()) == {
    'missingAcquisition': True, 'liveProvider': False,
}
native = json.loads((logs / 'vk-token-native-after.log').read_text())
assert native['confirmedImport'] and native['cancellableValidation']
assert native['boundedReadRecovery'] and native['liveProvider'] is False
for suffix in ['lint-final', 'electron-lint', 'secrets', 'diff']:
    assert not (logs / f'vk-token-{suffix}.log').read_text().strip(), suffix
assert 'No findings to report' in (logs / 'vk-token-workflow-audit.log').read_text()
sources = [name for name in changed_sources(root)
           if name != 'experiments/issue-56/vacancy-input-order.mjs']
sources += evidence_logs(root, 'vk-token')
sources += [
    'experiments/issue-56/evidence_bundle.py',
    'ci-logs/vk-desktop-reference-requirements.source',
    'ci-logs/vk-desktop-reference-main.source',
]
entries = {name: (root / name).read_bytes() for name in sorted(set(sources))}
for name in sources:
    if name.startswith(('js/src/', 'js/electron/')) and subprocess.run(
            ['git', 'cat-file', '-e', f'ea0c506e:{name}'], cwd=root,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
        entries[f'before/{name}'] = subprocess.check_output(
            ['git', 'show', f'ea0c506e:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps({
    'issue_complete': False, 'hosted_verification_pending': True,
    'unchecked_required_rows': 60, 'live_provider_verified': False,
    'parent_bundle': 'ea0c506e75ab7d55a05906ef0cb40fea826f2ede',
    'focused_node_cases': 41,
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/vk-token.tar.gz', entries)
