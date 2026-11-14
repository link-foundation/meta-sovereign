"""Preserve HH boundary privacy evidence without claiming full provider parity."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'hh-captcha')
checks = {
    'before': ('tests 11', 'fail 10', 'Challenge payload access: answer'),
    'before-native': ('HH text CAPTCHA boundary is missing.',),
    'focused-final': ('pass 56', 'fail 0'),
    'deno-final': ('51 passed | 0 failed',),
    'native-final': ('"markers":2', '"challengeReads":0', '"challengeActions":0',
                     '"dailyLimitPriority":true', '"sends":0', '"errors":[]', 'OK (chromium)'),
    'mcp-server': ('"closed":true', '"liveProvider":false', '"pageErrors":[]'),
    'format-final': ('All matched files use Prettier code style!',),
}
for name, fragments in checks.items():
    assert all(fragment in read(name) for fragment in fragments), name
for name in ('lint-final', 'secrets-final', 'diff-final'):
    assert not read(name).strip(), name
assert 'ERROR:' not in read('duplication-final')
result = json.loads((logs / 'hh-captcha-mcp-result.json').read_text())
receipt = json.loads(result['content'][0]['text'].split('### Result\n', 1)[1].split('\n', 1)[0])
assert receipt['resourcesClosed'] and receipt['dailyLimitPriority']
assert all(receipt[name] == 0 for name in ('challengeReads', 'challengeActions', 'sends'))
assert receipt['markers'] == 2 and receipt['locales'] == 4 and not receipt['errors']
parent = 'b4257480b578ae831db564d2a1965ef93b625ab4'
sources = changed_sources(root) + evidence_logs(root, 'hh-captcha')
sources += ['experiments/issue-56/application_parent_fixture.py',
            'ci-logs/reference-hh-captcha.mjs', 'ci-logs/reference-hh-limits.mjs',
            'ci-logs/reference-hh-limit-captcha.mjs',
            'ci-logs/checks-43598794698-webkit-4-cancelled.log',
            'ci-logs/checks-43596139531-webkit-4.log', 'ci-logs/ci-e2bc-current.json']
bundle(root, sources, 'docs/case-studies/issue-56/data/hh-captcha-boundaries.tar.gz', {
    'published_parent': parent, 'native_schema': 19,
    'parent_cases_failed': 10, 'parent_cases_total': 11,
    'node_final_group': 56, 'deno_final_group': 51,
    'native_chromium': 1, 'independent_mcp': 1, 'sends': 0,
    'challenge_reads': 0, 'challenge_actions': 0, 'visible_markers': 2,
    'authenticated_provider': False, 'original_inventory_unchecked': 81,
    'issue_complete': False, 'exact_head_ci_required': True,
    'cancelled_parent_ci': {'run': 43598794698, 'job': 132459876361,
                            'phase': 'checkout', 'cause': 'unproven'},
    'passing_diagnostic_ci': {'run': 43596139531, 'head': 'e2bc1bd9'},
}, 'hh-captcha-*.png', before={
    name: parent for name in ('js/src/forms/read-document.js',
                            'js/src/jobs/application-page.js')
})
