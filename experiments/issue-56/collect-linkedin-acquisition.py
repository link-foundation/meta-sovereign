"""Preserve finite acquisition regressions and their exact published CI evidence."""
from pathlib import Path
from evidence_bundle import evidence_context, changed_sources, verify_evidence, write_hashed_archive

root, logs, read = evidence_context(__file__, 'linkedin-acquisition')
verify_evidence(read, {
    'before': ['fail 2'],
    'focused': ['pass 27', 'fail 0'],
    'native': ['"profileLoads":1', '"aboutGuards":3', '"providerWrites":0'],
    'format-check': ['All matched files use Prettier code style!'],
}, empty=('lint', 'secrets', 'diff'))
names = [name for name in changed_sources(root, '8cbe939c')
         if Path(name).suffix in ['.js', '.mjs', '.py', '.md', '.png']
         and not name.endswith(('app.min.js', '/PLAN.md'))]
sources = len(names)
names += [f'ci-logs/linkedin-acquisition-{name}.log' for name in [
    'before', 'before-driver', 'focused', 'native', 'format-check',
    'lint', 'secrets', 'diff', 'duplication', 'build',
]]
names += [f'ci-logs/cv-loading-{name}.log' for name in [
    'focused', 'browser', 'plan-browser', 'lint', 'build',
]]
names += ['ci-logs/checks-43853402642-bun-windows.log',
          'ci-logs/linkedin-acquisition-parent-ci.json']
write_hashed_archive(root,
    root / 'docs/case-studies/issue-56/data/linkedin-acquisition.tar.gz', names,
    {'parent': '8cbe939c', 'focusedChecks': 27, 'newChecks': 10,
     'loadingChecks': 18, 'liveProvider': False, 'remainingRows': 60,
     'hostedAccepted': False}, sources)
