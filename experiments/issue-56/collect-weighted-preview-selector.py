"""Retain the exact hosted ambiguity and finite native correction evidence."""
from pathlib import Path
import json
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
parent = '4bb612207b6cc2673862a6f5a196d13775096a6b'
metadata = json.loads((logs / '4bb61220-main-progress.json').read_text())
assert metadata['headSha'] == parent
job = next(job for job in metadata['jobs'] if job['databaseId'] == 134443701572)
assert job['conclusion'] == 'failure'
raw = (logs / '4bb61220-chromium-shard3-failure.log').read_text()
assert 'resolved to 2 elements' in raw and 'Completed questions in 15017ms; exit 1' in raw
before = (logs / 'weighted-preview-selector-before.log').read_text()
after = (logs / 'weighted-preview-selector-after.log').read_text()
assert 'strict mode violation' in before and 'resolved to 2 elements' in before
assert '"requiresReview":true,"methodSaved":true' in after
assert '[e2e-questions] OK (chromium)' in after and 'SKIP:' not in after
for name in ['lint', 'secrets', 'parent']:
    assert not (logs / f'weighted-preview-selector-{name}.log').read_text().strip()
assert 'All matched files use Prettier code style!' in (logs / 'weighted-preview-selector-format.log').read_text()
paths = [
    'js/tests/helpers/e2e-question-weighted.mjs', 'js/tests/e2e-questions-browser.mjs',
    'js/tests/helpers/e2e-question-matching.mjs', 'js/tests/helpers/e2e-chat.mjs',
    'js/src/web/question-controls.js', 'experiments/issue-56/question-weighted-fixture.mjs',
    'experiments/issue-56/weighted-preview-selector-parent.py',
    'experiments/issue-56/collect-weighted-preview-selector.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/ci-weighted-preview-selector.md',
]
entries = {name: (root / name).read_bytes() for name in paths}
name = 'js/tests/helpers/e2e-question-weighted.mjs'
entries[f'before/{name}'] = subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root)
for path in logs.glob('weighted-preview-selector-*'):
    if path.is_file() and path.suffix in ['.log', '.mjs'] and not path.name.endswith('-commit.log'):
        entries[str(path.relative_to(root))] = path.read_bytes()
for name in ['4bb61220-main-progress.json', '4bb61220-chromium-shard3-failure.log']:
    entries[f'ci-logs/{name}'] = (logs / name).read_bytes()
entries['metadata.json'] = (json.dumps(dict(parent=parent, run=44196461607,
    job=134443701572, hostedFailureLines=[1147, 1155], nativeBeforeFails=True,
    nativeAfterPasses=True, engine='chromium', liveProvider=False,
    productChanged=False, hostedVerificationPending=True,
    issueComplete=False), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/weighted-preview-selector.tar.gz', entries)
