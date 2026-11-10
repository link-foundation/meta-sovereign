"""Preserve the shared-counter reproduction and complete failing hosted job."""
import json
from pathlib import Path
import runpy
import shutil
import tempfile

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert 'browser cleanup without submissions' in (logs / 'forms-submission-counter-before.log').read_text()
after = (logs / 'forms-submission-counter-after.log').read_text()
assert '[forms-post-learning] {"submits":1,"closed":3}' in after
assert 'OK (chromium)' in after and after.count('"submits":0') == 2
assert not (logs / 'forms-submission-counter-lint.log').read_text().strip()
paths = [
    'js/tests/e2e-forms-reader-browser.mjs',
    'js/tests/helpers/e2e-form-capacity.mjs',
    'js/tests/helpers/e2e-form-model.mjs',
    'docs/case-studies/issue-56/ci-forms-submission-counter.md',
    'experiments/issue-56/collect-form-counter.py',
    'ci-logs/forms-capacity-chromium-130147209271.log',
]
paths += [f'ci-logs/forms-submission-counter-{suffix}' for suffix in (
    'before.log', 'after.log', 'lint.log', 'format.log', 'parent-ci.json', 'current-runs.json')]
writer = runpy.run_path(str(root / 'experiments/issue-56/archive-evidence.py'))['archive']
with tempfile.TemporaryDirectory(prefix='form-counter-') as directory:
    stage = Path(directory)
    for name in paths:
        destination = stage / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(root / name, destination)
    (stage / 'metadata.json').write_text(json.dumps({
        'date': '2026-11-10', 'preceding_head': '9e88993f1259cf920bf3c14dab4c48bcef62dbc8',
        'failed_job': 130147209271, 'failed_log_line': 2414,
        'owner_submissions': 1, 'closed_browsers': 3, 'additional_submissions': 0,
    }, indent=2) + '\n')
    writer(stage, root / 'docs/case-studies/issue-56/data/ci-forms-submission-counter.tar.gz')
