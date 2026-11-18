"""Retain exact hosted formatting failures and locked-tool reproduction."""
from pathlib import Path
import subprocess
from evidence_bundle import bundle

root = Path(__file__).resolve().parents[2]
requirements = ['docs/REQUIREMENTS' + suffix + '.md'
                for suffix in ['', '.ru', '.hi', '.zh']]
logs = ['cv-workplace-identity-parent-lint.log',
        'cv-workplace-identity-parent-lint-annotations.json',
        'cv-workplace-identity-parent-checks.json',
        'ci-locked-prettier-before.log', 'ci-locked-prettier-after.log',
        'ci-locked-prettier-lint.log', 'ci-locked-prettier-versions.json',
        'ci-locked-prettier-published-lint.log',
        'cv-workplace-identity-locked-ci.json',
        'ci-locked-prettier-requirements-before.log',
        'ci-locked-prettier-requirements-after.log']
assert '[warn]' in (root / 'ci-logs/ci-locked-prettier-requirements-before.log').read_text()
assert 'All matched' in (root / 'ci-logs/ci-locked-prettier-requirements-after.log').read_text()
locale = 'ci-logs/ci-locked-prettier-hi-corrected.js'
(root / locale).write_bytes(subprocess.check_output([
    'git', 'show', '89eb873c:js/src/web/locales/hi-vacancy.js'], cwd=root))
sources = ['docs/case-studies/issue-56/ci-locked-prettier.md',
           'experiments/issue-56/collect-ci-locked-prettier.py',
           'package-lock.json', locale, *requirements,
           *['ci-logs/' + name for name in logs]]
before = {name: '89eb873c' for name in requirements}
before['js/src/web/locales/hi-vacancy.js'] = 'd76215a1'
bundle(root, sources, 'docs/case-studies/issue-56/data/ci-locked-prettier.tar.gz',
       dict(initial_head='d76215a1', follow_up_head='89eb873c',
            locked_formatter='3.9.10', initial_errors=10,
            follow_up_markdown_files=4),
       'no-ci-locked-prettier-screenshots', before=before)
