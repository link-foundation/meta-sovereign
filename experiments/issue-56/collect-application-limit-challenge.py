"""Verify finite capture/refusal observations before archiving their evidence."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'hh-limit-captcha')
checks = {
    'before': ('Coexisting CAPTCHA prevented the acknowledged daily-limit draft.',),
    'before-native': ('Coexisting CAPTCHA prevented the acknowledged daily-limit draft.',),
    'focused-final': ('pass 73', 'fail 0'),
    'deno-final': ('73 passed | 0 failed',),
    'registration-final': ('pass 5', 'fail 0'),
    'format-final': ('All matched files use Prettier code style!',),
}
for name, fragments in checks.items():
    assert all(fragment in read(name) for fragment in fragments), name
for name in ('lint-final', 'secrets-final', 'diff-final'):
    assert not read(name).strip(), name
assert 'OK (chromium)' in read('native-final')
rows = [json.loads(line.split(' ', 1)[1]) for line in read('native-final').splitlines()
        if line.startswith('[browser-scenario] ')]
receipt = next(row['result'] for row in rows if row['phase'] == 'passed')
assert receipt['closes'] == 2 and receipt['savedBeforeClose']
assert receipt['remounted'] and receipt['originalDeadline']
assert receipt['challengeContentReads'] == receipt['challengeActions'] == receipt['sends'] == 0
assert receipt['errors'] == []
assert receipt['boundaries']['refusals'] == 14
values = json.loads((logs / 'hh-limit-captcha-mcp-values.json').read_text())
assert values['challengeCloses'] == 2 and not values['challengeVisible']
assert values['challengeActions'] == values['sends'] == 0
assert values['experience'] == 'Later native owner answer while waiting.'
assert values['letter'] == 'Actual owner letter before waiting.'
replay = json.loads((logs / 'hh-limit-captcha-mcp-replay.json').read_text())
assert replay['laterAnswerPreserved'] and replay['letterPreserved'] and replay['waiting']
assert replay['deadline'] == '2026-11-14T02:00:00.000Z'
assert '"closed":true' in read('mcp-server-final') and '"pageErrors":[]' in read('mcp-server-final')
duplication = read('duplication-final')
assert 'Found ' in duplication and 'HTML report saved' in duplication
assert 'ERROR:' not in duplication and 'MODULE_NOT_FOUND' not in duplication
parent = 'cd2a3337fa7222f924e4b55c60b3503fabd8dacd'
sources = changed_sources(root) + evidence_logs(root, 'hh-limit-captcha')
sources += ['experiments/issue-56/application_parent_fixture.py',
            'ci-logs/checks-43606682331-windows-deno-1.log',
            'ci-logs/ci-cd2a-windows-deno-annotations.json',
            'ci-logs/ci-cd2a-latest.json']
bundle(root, sources, 'docs/case-studies/issue-56/data/application-limit-challenge.tar.gz',
       dict(published_parent=parent, node_passed=73, deno_passed=73,
            registration_passed=5, native=receipt, independent_mcp=values,
            authenticated_provider=False, original_incomplete_rows=81,
            issue_complete=False, exact_head_ci_required=True),
       'issue-56-limit-challenge*/*.png', before={
           name: parent for name in ('js/src/forms/read-document.js',
                                    'js/src/jobs/application-limit-backups.js')})
