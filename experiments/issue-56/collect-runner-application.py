"""Preserve the source-bound detached application dependency preparation proof."""
import json

from evidence_bundle import bundle, changed_sources, evidence_context


root, logs, read = evidence_context(__file__, 'runner-lock')
parent = '328e5282597ce6ff1fc09b914240c514f2823872'
for phase, installs, local, remote, controls in (
        ('before', 0, 'running', 'stopped', []),
        ('after', 1, 'stopped', 'running', [['local', 'stop'], ['server', 'start']])):
    assert json.loads(read(f'browser-{phase}').splitlines()[-1]) == dict(
        installs=installs, states=dict(local=local, server=remote), controls=controls,
        resourcesClosed=True), phase
assert 'fail 1' in read('parent-test')
assert 'Runner profile unavailable or invalid.' in read('parent-test')
assert 'pass 73' in read('focused-node')
assert '70 passed (3 steps) | 0 failed' in read('focused-deno')
native = {name: json.loads(read(f'native-{name}').splitlines()[-1])
          for name in ('production', 'ssh')}
for name, result in native.items():
    assert result == dict(nativeNpm=True, actualSsh=name == 'ssh', actualDocker=False,
                          production=name == 'production', installs=1,
                          installedPackages=12 if name == 'production' else 1,
                          coldVerified=True, warmReused=True, resourcesClosed=True), name
mcp = json.loads((logs / 'runner-lock-mcp.json').read_text())
assert mcp['mcpClosed'] and mcp['observed'] == dict(
    digestVisible=True, hintVisible=True, width=390, initialReadRefused=True,
    warmStart=True, failures=[])
assert 'status of 409 (Conflict)' in read('mcp-console')
assert '/api/runner/profile' in read('mcp-console')
assert json.loads(read('mcp-fixture').splitlines()[-1]) == dict(
    installs=1, states=dict(local='stopped', server='stopped'),
    controls=[['local', 'stop'], ['server', 'start'], ['server', 'stop'],
              ['server', 'start'], ['server', 'stop']], resourcesClosed=True)
assert json.loads((logs / 'runner-lock-mcp-screenshot.json').read_text()) == dict(
    mcpClosed=True, observed=dict(status=200, tutorialHidden=True, width=390,
                                  localStopped=True, serverRunning=True))
assert json.loads(read('mcp-screenshot-fixture').splitlines()[-1])['resourcesClosed']
for name in ('lint-final', 'secrets', 'diff'):
    assert not read(name).strip(), name
assert 'All matched files use Prettier code style!' in read('format-final')
assert '0 over the 1500 line limit' in read('lines')
sources = changed_sources(root)
logs_to_archive = [f'ci-logs/runner-lock-{name}.log' for name in (
    'browser-before', 'browser-after', 'parent-test', 'focused-node', 'focused-deno',
    'native-production', 'native-ssh', 'mcp-fixture', 'mcp-console',
    'mcp-screenshot-fixture', 'lint-final', 'secrets', 'diff', 'format-final',
    'lines', 'build-web')]
bundle(root, sources + logs_to_archive + ['ci-logs/runner-lock-mcp.json',
       'ci-logs/runner-lock-mcp-screenshot.json'],
       'docs/case-studies/issue-56/data/runner-application-preparation.tar.gz',
       dict(parent=parent, criterion='VD01', criterionComplete=False, nodeChecks=73,
            denoChecks=70, denoSubtests=3, native=native, mcp=mcp,
            hostedDockerVerified=False, liveProvider=False),
       'issue-56-runner-application-lock/*.png',
       {name: parent for name in ('js/src/cli/runner-profile.js',
                                  'js/src/server/runner-application.js',
                                  'js/src/server/runner-control.js',
                                  'js/src/server/runner-tools/check-application.mjs')})
