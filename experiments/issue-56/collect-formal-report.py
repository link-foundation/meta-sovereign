"""Archive the reviewed report unit without promoting live acceptance."""
import json
from pathlib import Path
from evidence_bundle import evidence_context, changed_sources, verify_evidence, write_hashed_archive

root, logs, read = evidence_context(__file__, 'formal-report')
verify_evidence(read, {
    'before': ['fail 2'],
    'focused': ['pass 23', 'fail 0'],
    'browser': ['"scenario":"verifyCvFormalReports","phase":"passed"',
                '"scenario":"verifyCvExperiencePlans","phase":"passed"',
                '"scenario":"verifyCvExperienceDocuments","phase":"passed"',
                '[e2e-formal-report-focused] OK (chromium)'],
    'format-check': ['All matched files use Prettier code style!'],
}, empty=('lint', 'secrets', 'diff'))
inspection = (logs / 'formal-report-mcp-after.json').read_text()
result = json.loads(inspection.split('### Result\n')[1].split('\n###')[0])
assert result['starts'] == 1 and result['recoveredWithoutReplay'] and result['consentRequired']
assert result['stoppedOwnedSearch'] and result['errors'] == [] and result['synthetic']
assert set(result['locales']) == {'en', 'ru', 'hi', 'zh'}
assert result['layout'] == {'viewport': 390, 'width': 390}
source_paths = [name for name in changed_sources(root, '83101692')
                if Path(name).suffix in {'.js', '.mjs', '.md', '.py', '.png'}
                and not name.endswith(('app.min.js', '/PLAN.md'))]
proof_paths = [f'ci-logs/formal-report-{name}.log' for name in (
    'before', 'before-driver', 'before-bundle', 'focused', 'browser', 'build',
    'format-check', 'lint', 'secrets', 'diff', 'duplication', 'inspection-server')]
proof_paths += [f'ci-logs/formal-report-{name}.json' for name in (
    'mcp-before', 'mcp-after', 'parent-runs', 'parent-pr', 'parent-check-status')]
write_hashed_archive(root, root / 'docs/case-studies/issue-56/data/formal-reports.tar.gz',
                     source_paths + proof_paths,
                     {'parent': '83101692', 'focusedChecks': 23, 'reportChecks': 18,
                      'nativeFixtures': 3, 'liveProvider': False, 'upstreamWrites': 0,
                      'remainingRows': 60, 'hostedAccepted': False}, len(source_paths))
