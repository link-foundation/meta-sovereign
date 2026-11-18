"""Preserve the exact hosted failure and bounded retained-document regression."""
from pathlib import Path
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
names = [
    'ci-logs/vk-desktop-webkit-shard2.log',
    'ci-logs/vk-desktop-webkit2-artifacts/ms-e2e-questions-webkit.png',
    'ci-logs/ci-legacy-disclosure-before.log',
    'ci-logs/ci-legacy-disclosure-after.log',
    'ci-logs/ci-legacy-disclosure-controls.log',
    'ci-logs/ci-legacy-disclosure-lint.log',
    'js/tests/helpers/e2e-question-legacy-profile.mjs',
    'js/tests/helpers/question-preview.mjs',
    'js/tests/helpers/e2e-question-disclosures.mjs',
    'experiments/issue-56/ci-legacy-disclosure-native.mjs',
    'experiments/issue-56/collect-ci-legacy-disclosure.py',
    'docs/case-studies/issue-56/ci-legacy-disclosure.md',
    'docs/screenshots/issue-56-ci-legacy-disclosure/before.png',
    'docs/screenshots/issue-56-ci-legacy-disclosure/after.png',
]
assert '"rootClosed":true' in (root / names[2]).read_text()
assert '"profileSaved":true' in (root / names[3]).read_text()
assert 'fail 0' in (root / names[4]).read_text()
assert not (root / names[5]).read_text().strip()
entries = {name: (root / name).read_bytes() for name in names}
parent = 'b0bb53aef2fd7556baabfbe6f51103659ce25ef2'
name = 'js/tests/helpers/e2e-question-legacy-profile.mjs'
entries['before/' + name] = subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root)
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-legacy-disclosure.tar.gz', entries)
