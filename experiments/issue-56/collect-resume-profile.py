"""Validate and preserve the explicit résumé-contact import evidence."""
import hashlib
import json
from pathlib import Path
import runpy
import shutil
from tempfile import TemporaryDirectory

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
expected = {
    'before.log': 'fail 7',
    'browser-before.log': 'canonical birth date is offered for review',
    'tests.log': 'pass 56',
    'deno.log': '56 passed | 0 failed',
    'browser-after.log': 'OK (chromium)',
    'format-check.log': 'All matched files use Prettier code style!',
}
for suffix, text in expected.items():
    assert text in (logs / f'resume-profile-{suffix}').read_text(), suffix
assert not (logs / 'resume-profile-lint.log').read_text().strip()
receipt = json.loads((logs / 'resume-profile-mcp.json').read_text())
assert receipt['status'] == 200 and receipt['initiallySelected'] == 0
assert len(receipt['cvChoices']) == 5 and len(receipt['selected']) == 10
assert receipt['selected']['birthDate'] == '1990-03-02'
assert receipt['selected']['github'].splitlines() == [
    'https://github.com/synthetic-owner', 'https://github.com/synthetic-team',
]
assert not receipt['mobileOverflow']
server = json.loads((logs / 'resume-profile-mcp-server.log').read_text().splitlines()[-1])
assert server == {'sourceUnchanged': True, 'savedProfiles': 0}
sources = [
    'js/src/automation/question-profile-source.js',
    'js/src/automation/question-profile-contact-values.js',
    'js/src/automation/question-profile-text.js',
    'js/src/web/question-profile-import.js', 'js/src/cli/automation-commands.js',
    'js/tests/question-profile-resume.test.js',
    'js/tests/question-profile-resume-controls.test.js',
    'js/tests/helpers/e2e-resume-profile.mjs', 'js/tests/e2e-questions-browser.mjs',
    'experiments/issue-56/resume-profile-fixture.mjs',
    'experiments/issue-56/resume-profile-mcp.mjs',
    'experiments/issue-56/question-profile-ui.mjs',
    'experiments/issue-56/collect-resume-profile.py',
    'docs/case-studies/issue-56/resume-profile-import.md',
]
sources.extend(f'js/src/web/locales/{locale}-profile-import.js' for locale in ['en', 'ru', 'hi', 'zh'])
sources.extend(f'ci-logs/resume-profile-{suffix}' for suffix in [
    *expected, 'lint.log', 'build.log', 'mcp.json', 'mcp-server.log',
    'pushed-runs.json', 'identity-parent-ci.json',
])
sources.extend(f'ci-logs/question-profile-reference/{name}.mjs' for name in [
    'resume-export', 'resume-export-dom', 'form-prefill',
])
write_archive = runpy.run_path(str(root / 'experiments/issue-56/archive-evidence.py'))['archive']
with TemporaryDirectory(prefix='resume-profile-') as temporary:
    staged = Path(temporary)
    for source in sources:
        target = staged / source
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(root / source, target)
    metadata = {
        'preceding_head': '07ca5e138b028dfff67b94a46bf7c5f0a553130d',
        'reference_commit': 'fa0991b8c2d0896fb3b4be6c69947f0590094b15',
        'node_checks': 56, 'deno_checks': 56, 'mcp': receipt, 'server': server,
        'screenshots': {
            image.name: hashlib.sha256(image.read_bytes()).hexdigest()
            for image in sorted((root / 'docs/screenshots').glob('issue-56-resume-profile-*.png'))
        },
    }
    (staged / 'metadata.json').write_text(json.dumps(metadata, indent=2) + '\n')
    write_archive(staged, root / 'docs/case-studies/issue-56/data/resume-profile-import.tar.gz')
