"""Archive the bundled desktop runner reproduction and owned shutdown evidence."""
import json

from evidence_bundle import bundle, changed_sources, evidence_context


root, logs, read = evidence_context(__file__, 'desktop-local-runner')
parent = '2749025170c7a0ff64af32a1e82560558a8ec08b'
assert '"configureStatus":400,"draftRetained":true' in read('browser-before')
assert '"configureStatus":200,"saved":true' in read('browser-after')
assert '"applicationReady":true,"listenerClosed":true' in read('browser-after')
native = json.loads(read('native-final').splitlines()[-1])
for field in ('textLino', 'binaryLino', 'cli', 'listenerClosed',
              'locksReleased', 'ownerShutdown'):
    assert native[field], field
mcp = json.loads((logs / 'desktop-local-runner-mcp.json').read_text())
assert mcp['mcpClosed'] and mcp['browser'] == dict(
    width=390, savedProfile=True, workerHealth=200, applicationReady=True,
    listenerClosed=True, errors=[])
assert json.loads((logs / 'desktop-utility-process-asar.log').read_text()
                  .splitlines()[-1])['ready']
assert 'pass 72' in read('focused-node')
assert '72 passed | 0 failed' in read('focused-deno')
for name in ('lint-final', 'secrets', 'diff'):
    assert not read(name).strip(), name
assert 'All matched files use Prettier code style!' in read('format-final')

sources = changed_sources(root)
logs_to_archive = [f'ci-logs/desktop-local-runner-{name}.log' for name in (
    'browser-before', 'browser-after', 'browser-before-server',
    'browser-after-server', 'native-final', 'focused-node', 'focused-deno',
    'mcp-console', 'lint-final', 'secrets', 'diff', 'format-final', 'lines')]
logs_to_archive += ['ci-logs/desktop-local-runner-mcp.json',
                    'ci-logs/desktop-utility-process-asar.log']
donor = [f'ci-logs/runner-vk-desktop-{name}' for name in (
    'readme.txt', 'main.cjs', 'tree.txt')]
bundle(root, sources + logs_to_archive + donor,
       'docs/case-studies/issue-56/data/desktop-local-runner.tar.gz',
       dict(parent=parent, criterion='VD01', criterionComplete=False,
            nodeChecks=72, denoChecks=72, native=native, mcp=mcp,
            hostedInstallerVerified=False, liveProvider=False),
       'issue-56-desktop-local-runner/*.png',
       {name: parent for name in sources if name == 'js/src/cli/runner-profile.js'})
