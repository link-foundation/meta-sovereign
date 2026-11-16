"""Preserve bounded comparison regressions, source hashes and UI evidence."""
import hashlib
from evidence_bundle import evidence_context, write_hashed_archive

root, logs, read = evidence_context(__file__, 'experience')
assert 'fail 1' in read('before')
assert 'pass 9' in read('node') and 'fail 0' in read('node')
assert 'pass 53' in read('existing') and 'fail 0' in read('existing')
assert 'pass 4' in read('i18n') and 'fail 0' in read('i18n')
assert '"errors":[]' in read('mcp-before')
assert '"width":390' in read('mcp-after') and '"errors":[]' in read('mcp-after')
console = read('mcp-console')
assert 'Warnings: 0' in console
errors = [line for line in console.splitlines() if line.startswith('[ERROR]')]
assert all('net::ERR_CACHE_WRITE_FAILURE' in line and '/app.min.js:1' in line for line in errors)
assert len(errors) <= 1
for check in ['lint', 'secrets', 'diff']:
    assert not read(check).strip(), check
names = [
    'js/src/cv/experience.js', 'js/src/cv/experience-report.js',
    'js/src/cv/index.js', 'js/src/cli/cv-commands.js',
    'js/src/server/routes-cv.js', 'js/src/web/cv-experience-view.js',
    'js/src/web/cv-view.js', 'js/src/web/locales/cv-experience.js',
    'js/src/web/locales/index.js', 'js/tests/cv-experience.test.js',
    'js/tests/cv-experience-surfaces.test.js',
    'js/tests/helpers/e2e-cv-experience.mjs',
    'js/tests/e2e-cv-translation-browser.mjs',
    'experiments/issue-56/experience-before.py',
    'experiments/issue-56/experience-fixture.mjs',
    'experiments/issue-56/experience-browser-fixture.mjs',
    'experiments/issue-56/experience-inspect.mjs',
    'experiments/issue-56/experience-inspection-server.mjs',
    'experiments/issue-56/collect-experience-comparison.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/experience-comparison.md',
    'docs/case-studies/issue-56/experience-sync-plan.md',
]
source_count = len(names)
names += [str(path.relative_to(root)) for path in sorted(
    (root / 'docs/screenshots/issue-56-experience').glob('*.png'))]
names += [f'ci-logs/experience-{check}.log' for check in [
    'before', 'node', 'existing', 'i18n', 'mcp-before', 'mcp-after',
    'mcp-console', 'lint', 'secrets', 'diff', 'build', 'duplication',
]]
write_hashed_archive(root, root / 'docs/case-studies/issue-56/data/experience-comparison.tar.gz',
                     names, {'parent': 'c6c0510d', 'focusedChecks': 9,
                             'existingChecks': 53, 'localeChecks': 4,
                             'liveProvider': False, 'remainingRows': 60,
                             'bundleSha256': hashlib.sha256((root / 'js/src/web/app.min.js').read_bytes()).hexdigest(),
                             'hostedAccepted': False}, source_count)
