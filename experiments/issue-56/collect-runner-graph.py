"""Archive the detached application module check and the exact parent regression."""
import json

from evidence_bundle import bundle, changed_sources, evidence_context


root, logs, read = evidence_context(__file__, 'runner-graph')
parent = 'c81c40b5da2188976ae027e3f356272a020af35c'
for phase, control, local, checks in (
        ('before', [['local', 'stop'], ['server', 'start']], 'stopped', 0),
        ('after', [], 'running', 1), ('mcp-fixture', [], 'running', 4)):
    assert json.loads(read('browser-' + phase if phase != 'mcp-fixture' else phase)
                      .splitlines()[-1]) == dict(
        states=dict(local=local, server='stopped'), controls=control,
        graphChecks=checks, resourcesClosed=True), phase
assert 'pass 53' in read('focused-node')
assert '53 passed | 0 failed' in read('focused-deno')
assert 'fail 4' in read('parent-tests')
assert 'runner-application-dependencies-unavailable' in read('parent-tests')
for name in ('lint-final', 'secrets', 'diff'):
    assert not read(name).strip(), name
assert 'All matched files use Prettier code style!' in read('format-final')
native = json.loads(read('native-ssh').splitlines()[-1])
assert native == dict(nativeSsh=True, peerRetained=True, productionGraphLoaded=True,
                      resourcesClosed=True)
mcp = json.loads((logs / 'runner-graph-mcp.json').read_text())
assert mcp['mcpClosed'] and mcp['observed'] == [dict(
    locale=locale, status=200, localRunning=True, serverStopped=True,
    width=390, errors=[]) for locale in ('en', 'ru', 'hi', 'zh')]
sources = changed_sources(root)
log_files = [f'ci-logs/runner-graph-{name}.log' for name in (
    'browser-before', 'browser-after', 'mcp-fixture', 'native-ssh', 'focused-node',
    'focused-deno', 'parent-tests', 'lint-final', 'secrets', 'diff',
    'format-final', 'lines', 'build-web')]
bundle(root, sources + log_files + ['ci-logs/runner-graph-mcp.json'],
       'docs/case-studies/issue-56/data/runner-application-graph.tar.gz',
       dict(parent=parent, criterion='VD01', criterionComplete=False,
            nodeChecks=53, denoChecks=53, native=native, mcp=mcp,
            hostedDockerVerified=False, liveProvider=False),
       'issue-56-runner-graph/*.png',
       {name: parent for name in ('js/src/server/runner-control.js',
                                  'js/src/server/runner-docker.js',
                                  'js/src/transport/runner-receipt.js',
                                  'js/src/web/locales/runner.js')})
