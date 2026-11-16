"""Verify finite native LinkedIn acquisition evidence before archiving it."""
import json
from pathlib import Path
from evidence_bundle import (
    evidence_context, changed_sources, verify_evidence, write_hashed_archive,
)

root, logs, read = evidence_context(__file__, 'linkedin-export')
verify_evidence(read, {
    'before': ['fail 1', "actual: 'undefined'"],
    'focused-final': ['pass 29', 'fail 0'],
    'focused': ['pass 46', 'fail 0'],
    'format': ['All matched files use Prettier code style!'],
})
native = json.loads(read('native-browser'))
assert native == {
    'synthetic': True, 'actualCommander': True, 'loads': 1,
    'jobs': 3, 'datelessFragmentsAreJobs': False,
}
for phase in ['before', 'after']:
    result = json.loads(read(f'mcp-{phase}'))['content'][0]['text']
    value = json.loads(result.split('### Result\n')[1])
    assert value['errors'] == [], phase
    if phase == 'after':
        assert value['lostAcknowledgementRecoveredWithoutReplay']
        assert value['explicitSelection'] and value['stopDuringLogin']
        assert value['downloads'] == 2
        assert value['layout'] == {'viewport': 390, 'width': 390}
        assert set(value['locales']) == {'en', 'ru', 'hi', 'zh'}
names = [name for name in changed_sources(root)
         if Path(name).suffix in ['.js', '.mjs', '.py', '.md', '.png']
         and not name.endswith(('app.min.js', '/PLAN.md'))]
sources = len([name for name in names if not name.endswith('.png')])
names += [f'ci-logs/linkedin-export-{name}.log' for name in [
    'before', 'focused-final', 'focused', 'format', 'lint-final', 'secrets',
    'diff', 'duplication', 'build', 'native-browser', 'mcp-before', 'mcp-after',
]]
names += ['ci-logs/linkedin-export-current-pr.json',
          'ci-logs/linkedin-export-current-runs.json']
write_hashed_archive(
    root, root / 'docs/case-studies/issue-56/data/linkedin-experience.tar.gz',
    names, {'parent': 'd00abfaf', 'focusedChecks': 29, 'newChecks': 17,
            'earlierFocusedChecks': 46, 'liveProvider': False,
            'remainingRows': 60, 'hostedAccepted': False}, sources,
)
