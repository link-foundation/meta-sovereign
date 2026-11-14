"""Preserve HH boundary privacy evidence without claiming full provider parity."""
import json
import sys
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

discovery = '--discovery' in sys.argv
prefix = 'hh-discovery' if discovery else 'hh-captcha'
root, logs, read = evidence_context(__file__, prefix)
total, failed, node, deno = (24, 12, 63, 63) if discovery else (11, 10, 56, 51)
failure = ('Discovery payload read before verification:' if discovery else
           'Challenge payload access: answer')
checks = {
    'before': (f'tests {total}', f'fail {failed}', failure),
    'before-native': (('readResumeListDocument ignored HH verification.' if discovery
                       else 'HH text CAPTCHA boundary is missing.'),),
    'focused-final': (f'pass {node}', 'fail 0'),
    'deno-final': (f'{deno} passed | 0 failed',),
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
result = json.loads((logs / f'{prefix}-mcp-result.json').read_text())
receipt = json.loads(result['content'][0]['text'].split('### Result\n', 1)[1].split('\n', 1)[0])
assert receipt['resourcesClosed'] and receipt['dailyLimitPriority']
assert all(receipt[name] == 0 for name in ('challengeReads', 'challengeActions', 'sends'))
assert receipt['markers'] == 2 and receipt['locales'] == 4 and not receipt['errors']
if discovery:
    assert receipt['discoveryReaders'] == 3 and '"discoveryReaders":3' in read('native-final')
parent = ('c976dc985f3629afcb6f6fd6bc446d2a4d89439e' if discovery else
          'b4257480b578ae831db564d2a1965ef93b625ab4')
sources = changed_sources(root) + evidence_logs(root, prefix)
sources += ['experiments/issue-56/application_parent_fixture.py',
            'ci-logs/reference-hh-captcha.mjs', 'ci-logs/reference-hh-limits.mjs',
            'ci-logs/reference-hh-limit-captcha.mjs',
            'ci-logs/checks-43598794698-webkit-4-cancelled.log',
            'ci-logs/checks-43596139531-webkit-4.log', 'ci-logs/ci-e2bc-current.json']
if discovery:
    sources += ['ci-logs/checks-43600700798-ubuntu-deno.log',
                'ci-logs/checks-43600700798-chromium-2.log',
                'ci-logs/checks-43600700798-macos-node-1-cancelled.log']
before = (('js/src/jobs/read-resumes.js', 'js/src/jobs/read-search.js',
           'js/src/assignments/vacancy-reader.js') if discovery else
          ('js/src/forms/read-document.js', 'js/src/jobs/application-page.js'))
bundle(root, sources, f'docs/case-studies/issue-56/data/{prefix}-boundaries.tar.gz', {
    'published_parent': parent, 'native_schema': 19,
    'parent_cases_failed': failed, 'parent_cases_total': total,
    'node_final_group': node, 'deno_final_group': deno,
    'native_chromium': 1, 'independent_mcp': 1, 'sends': 0,
    'challenge_reads': 0, 'challenge_actions': 0, 'visible_markers': 2,
    'authenticated_provider': False, 'original_inventory_unchecked': 81,
    'issue_complete': False, 'exact_head_ci_required': True,
    'cancelled_parent_ci': {'run': 43598794698, 'job': 132459876361,
                            'phase': 'checkout', 'cause': 'unproven'},
    'passing_diagnostic_ci': {'run': 43596139531, 'head': 'e2bc1bd9'},
}, f'{prefix}-*.png', before={name: parent for name in before})
