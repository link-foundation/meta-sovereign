"""Validate the link-routing regression receipts and retain their exact inputs."""
import hashlib
import json
from pathlib import Path
import runpy
import shutil
from tempfile import TemporaryDirectory

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
expected = {
    'before.log': 'fail 4',
    'browser-before.log': 'link questions never offer saved No as text',
    'tests.log': 'pass 45',
    'deno.log': '45 passed | 0 failed',
    'browser-after.log': 'OK (chromium)',
    'format-check.log': 'All matched files use Prettier code style!',
}
for suffix, text in expected.items():
    assert text in (logs / f'forms-links-{suffix}').read_text(), suffix
assert not (logs / 'forms-links-lint.log').read_text().strip()
receipt = json.loads((logs / 'forms-links-mcp.json').read_text())
assert receipt['plan']['noProfileSelectable'] == 0
assert not receipt['plan']['phoneOverflow']
assert receipt['apply']['applyStatus'] == receipt['apply']['closeStatus'] == 200
assert receipt['apply']['readbackReceipts'] == 2
assert receipt['server']['submissions'] == 0
read = receipt['server']['reads'][0]
assert read['closed'] and read['values'] == {
    'resumeLink': 'https://hh.ru/resume/synthetic-owner',
    'githubLink': 'https://github.com/synthetic-owner',
    'linkedinLink': '', 'allLinks': 'Owner keeps this answer',
}
sources = [
    'js/src/forms/profile-fields.js', 'js/src/forms/link-answers.js',
    'js/src/forms/proposals.js', 'js/src/forms/model-drafts.js',
    'js/tests/forms-link-answers.test.js', 'js/tests/e2e-forms-reader-browser.mjs',
    'js/tests/helpers/e2e-form-links.mjs',
    'experiments/issue-56/forms-links-fixture.mjs',
    'experiments/issue-56/forms-reader-fixture.mjs',
    'experiments/issue-56/forms-reader-ui.mjs',
    'experiments/issue-56/collect-form-links.py',
    'docs/case-studies/issue-56/forms-link-answers.md',
]
sources.extend(f'ci-logs/forms-links-{suffix}' for suffix in [
    *expected, 'lint.log', 'build.log', 'mcp.json', 'mcp-server.log',
    'current-runs.json', 'identity-parent-ci.json',
])
write_archive = runpy.run_path(str(root / 'experiments/issue-56/archive-evidence.py'))['archive']
with TemporaryDirectory(prefix='form-links-') as temporary:
    staged = Path(temporary)
    for source in sources:
        target = staged / source
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(root / source, target)
    metadata = {
        'preceding_head': 'eea31cdbfa698bced1248a5df17b7045099d401d',
        'node_checks': 45, 'deno_checks': 45, 'mcp': receipt,
        'screenshots': {
            image.name: hashlib.sha256(image.read_bytes()).hexdigest()
            for image in sorted((root / 'docs/screenshots').glob('issue-56-forms-links-*.png'))
        },
    }
    (staged / 'metadata.json').write_text(json.dumps(metadata, indent=2) + '\n')
    write_archive(staged, root / 'docs/case-studies/issue-56/data/forms-link-answers.tar.gz')
