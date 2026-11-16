"""Verify bounded directed-plan evidence before preserving it in the case study."""
import json
from pathlib import Path
from evidence_bundle import evidence_context, changed_sources, verify_evidence, write_hashed_archive

root, logs, read = evidence_context(__file__, 'experience-plan')
verify_evidence(read, {
    'before': ['fail 1', "actual: 'undefined'"],
    'focused-final': ['pass 29', 'fail 0'],
    'existing-final': ['pass 47', 'fail 0'],
    'format': ['All matched files use Prettier code style!'],
    'browser': ['verifyCvExperiencePlans', '"phase":"passed"', 'OK (chromium)'],
})
for phase in ['before', 'after']:
    text = json.loads(read(f'mcp-{phase}'))['content'][0]['text']
    result = json.loads(text.split('### Result\n')[1].split('\n###')[0])
    assert result['errors'] == [], phase
    if phase == 'after':
        assert result['synthetic'] and result['starts'] == 1 and result['downloads'] == 2
        assert result['restoredWithoutReplay'] and result['stoppedOwnedJob']
        assert result['locales'] == ['ru', 'hi', 'zh', 'en']
        assert result['layout'] == {'viewport': 390, 'width': 390}
names = [name for name in changed_sources(root)
         if Path(name).suffix in ['.js', '.mjs', '.py', '.md', '.png']
         and not name.endswith(('app.min.js', '/PLAN.md'))]
sources = sum(not name.endswith('.png') for name in names)
names += [f'ci-logs/experience-plan-{name}.log' for name in [
    'before', 'focused-final', 'existing-final', 'format', 'lint-final',
    'secrets', 'diff', 'duplication', 'build', 'browser', 'mcp-before', 'mcp-after',
]]
names += ['ci-logs/experience-plan-current-pr.json', 'ci-logs/experience-plan-current-runs.json']
write_hashed_archive(root, root / 'docs/case-studies/issue-56/data/experience-planning.tar.gz',
    names, {'parent': '5e54935e', 'focusedChecks': 29, 'existingChecks': 47,
            'newChecks': 12, 'liveProvider': False, 'remainingRows': 60,
            'hostedAccepted': False}, sources)
