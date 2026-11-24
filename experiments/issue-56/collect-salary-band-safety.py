"""Keep the finite QA15 safety correction separate from full acceptance."""
import hashlib
import json
import runpy

from pathlib import Path

root = Path(__file__).resolve().parents[2]
evidence = runpy.run_path(str(root / 'experiments/issue-56/evidence_bundle.py'))
_, logs, read = evidence['evidence_context'](__file__, 'salary-band-safety')
assert 'fail 4' in read('parent-final') and 'pass 1' in read('parent-final')
evidence['verify_evidence'](read, {
    'focused-final': ['pass 67', 'fail 0', 'skipped 0'],
    'native-parent-final': ['"before":true', '"nativeReceipts":0',
                            '[e2e-question-salary-options] OK (chromium)'],
    'native-final': ['"before":false', '"nativeReceipts":1', '"blockedClicks":0',
                     '"textSends":0', '"pageErrors":[]',
                     '[e2e-question-salary-options] OK (chromium)'],
    'priority-native': ['"narrowLayout":true', '[e2e-question-controls] OK (chromium)'],
    'format-check': ['All matched files use Prettier code style!'],
})
for phase, before in [('before', True), ('after', False)]:
    result = json.loads((logs / f'salary-band-safety-mcp-{phase}-final.json').read_text())
    receipt = json.loads(result['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
    assert receipt['before'] == before and receipt['inspectionOnly']
    assert receipt['requiresReview'] != before and receipt['complete'] == before
    assert receipt['text'] == ('USD 5001–8000' if before else '')
    server = json.loads(read(f'mcp-{phase}-server').splitlines()[-1])
    assert server['resourcesClosed'] and not server['liveProvider']
    assert server['stats'] == {'clicks': 0, 'textSends': 0, 'draft': ''}
sources = evidence['changed_sources'](root)
evidence['bundle'](root,
    [*sources, *evidence['evidence_logs'](root, 'salary-band-safety'),
     *evidence['evidence_logs'](root, 'ci-macos-trap-call'),
     'ci-logs/checks-44028318708-133854350748.log',
     'ci-logs/checks-44028318708-133856281622.log',
     'ci-logs/checks-44029677088-133858807483.log',
     'ci-logs/checks-44029677088-133858807483.json',
     'ci-logs/ci-macos-trap-call-packaged-launch.zip',
     'ci-logs/salary-band-safety-base-ci-final.json'],
    'docs/case-studies/issue-56/data/salary-band-safety.tar.gz', {
        'acceptance': False, 'parentFailures': 4, 'focusedTests': 67,
        'nativeBlockedClicks': 0, 'nativePositiveReceipts': 1,
        'independentMcpRuns': 2, 'mcpEffects': 0,
        'pending': 'All 40 original unchecked criteria and exact-source hosted acceptance',
        'sourceHashes': {name: hashlib.sha256((root / name).read_bytes()).hexdigest()
                         for name in sources},
    }, '*salary-band-safety.png', before={
        'js/src/automation/question-salary.js': 'ba17dac9',
        'js/src/automation/salary-options.js': 'ba17dac9',
        'js/src/automation/salary-question.js': 'ba17dac9',
    })
