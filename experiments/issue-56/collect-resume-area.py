"""Preserve finite native area conversion and owner-Save verification evidence."""
from pathlib import Path
from evidence_bundle import evidence_context, changed_sources, verify_evidence, write_hashed_archive

root, logs, read = evidence_context(__file__, 'resume-area')
verify_evidence(read, {
    'before': ['fail 1', 'undefined'],
    'focused-final': ['pass 34', 'fail 0'],
    'compatibility': ['pass 43', 'fail 0'],
    'format': ['All matched files use Prettier code style!'],
    'browser': ['verifyResumeExports', 'verifyCvWatchWorkplace',
                '"cases":6', '"cases":4', 'OK (chromium)'],
})
names = [name for name in changed_sources(root)
         if Path(name).suffix in ['.js', '.mjs', '.py', '.md']
         and not name.endswith(('app.min.js', '/PLAN.md'))]
sources = len(names)
names += [f'ci-logs/resume-area-{name}.log' for name in [
    'before', 'focused-final', 'compatibility', 'format', 'lint-final',
    'secrets', 'diff', 'duplication', 'build', 'browser',
]]
names += [f'ci-logs/resume-area-{name}.json' for name in [
    'current-pr', 'current-runs', 'parent-checks',
]]
write_hashed_archive(root, root / 'docs/case-studies/issue-56/data/resume-area-metadata.tar.gz',
    names, {'parent': '68bb9f09', 'focusedChecks': 34, 'compatibilityChecks': 43,
            'newChecks': 6, 'browserCases': 10, 'liveProvider': False,
            'remainingRows': 60, 'hostedAccepted': False}, sources)
