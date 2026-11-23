"""Preserve the real lease conflict and verified Settings recovery."""
import json

from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs


root, logs, read = evidence_context(__file__, 'runner-profile-read')
parent = '74c002e9c56877fdcd9dfbd4314f60b820121074'
assert '409 !== 200' in read('parent') and 'fail 1' in read('parent')
assert 'pass 27' in read('node') and '27 passed | 0 failed' in read('deno')
closure = dict(backendCalls=0, resourcesClosed=True)
for name, status, saved in (('before', 409, False), ('after', 200, True)):
    log = read(f'browser-{name}').splitlines()
    result = next(json.loads(line.split(' ', 1)[1])['result'] for line in log
                  if '"phase":"passed"' in line)
    assert result == dict(status=status, savedProfile=saved), name
    assert json.loads(log[-1]) == closure, name
assert json.loads(read('mcp-fixture').splitlines()[-1]) == closure
mcp = json.loads((logs / 'runner-profile-read-mcp.json').read_text())
assert mcp == dict(mcpClosed=True, observed=dict(profileStatus=200, sessionStatus=409,
                                               savedProfile=True, editable=True,
                                               profileAlerts=0, width=390))
for name in ('lint-final', 'secrets', 'diff'):
    assert not read(name).strip(), name
assert 'All matched files use Prettier code style!' in read('format-final')
bundle(root, changed_sources(root) + evidence_logs(root, 'runner-profile-read'),
       'docs/case-studies/issue-56/data/runner-profile-read.tar.gz',
       dict(parent=parent, criterion='VD01', criterionComplete=False, nodeChecks=27,
            denoChecks=27, native=mcp, liveProvider=False),
       'issue-56-runner-profile-read/*.png',
       {name: parent for name in ('js/src/server/runner-controller.js',
                                  'js/src/server/runner-profile-store.js',
                                  'js/tests/runner-profile-api.test.js')})
