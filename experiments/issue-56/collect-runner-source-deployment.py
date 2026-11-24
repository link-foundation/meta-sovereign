"""Preserve verified cold source preparation and its owner review."""
import hashlib
import json
import subprocess

from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs, verify_evidence


root, logs, read = evidence_context(__file__, 'runner-source')
parent = '0fda777000e4ecf743ee205baeeee49163fde01c'
verify_evidence(read, {
    'node': ('pass 44', 'fail 0'),
    'deno': ('44 passed | 0 failed',),
    'format-final': ('All matched files use Prettier code style!',),
}, empty=('lint-final', 'secrets', 'diff', 'shell', 'workflow'))
for name, production, actual_ssh in (('native-production', True, False), ('native-ssh', False, True)):
    assert json.loads(read(name).splitlines()[-1]) == dict(
        production=production, actualSsh=actual_ssh, requests=2,
        tamperRefused=True, ownerDirectoryPreserved=True, sourcePrepared=True,
        warmReused=True, productionGraphLoaded=True, resourcesClosed=True,
    ), name
for name, before in (('browser-before', True), ('browser-after', False)):
    log = read(name).splitlines()
    result = next(json.loads(line.split(' ', 1)[1])['result'] for line in log
                  if '"phase":"passed"' in line)
    downloads = int(not before)
    assert result == dict(before=before, actions=[] if before else ['GET', 'POST'], downloads=downloads)
    assert json.loads(log[-1]) == dict(peerRunning=True, downloads=downloads, resourcesClosed=True)
assert json.loads(read('mcp-fixture').splitlines()[-1]) == dict(peerRunning=True, downloads=1, resourcesClosed=True)
mcp = json.loads((logs / 'runner-source-mcp.json').read_text())
assert mcp == dict(mcpClosed=True, observed=dict(actions=['GET', 'POST'], hashes=2, status=200,
                                                width=390, fits=True, prepared=True))
generated = 'js/src/web/app.min.js'
bundles = {
    'parent': hashlib.sha256(subprocess.check_output(['git', 'show', f'{parent}:{generated}'], cwd=root)).hexdigest(),
    'current': hashlib.sha256((root / generated).read_bytes()).hexdigest(),
}
sources = [name for name in changed_sources(root) if name != generated]
successful_logs = [name for name in evidence_logs(root, 'runner-source')
                   if not name.endswith(('-lint-first.log', '-native-small.log'))]
bundle(root, sources + successful_logs,
       'docs/case-studies/issue-56/data/runner-source-deployment.tar.gz',
       dict(parent=parent, criterion='VD01', criterionComplete=False, nodeChecks=44,
            denoChecks=44, bundleDigests=bundles, native=mcp, liveProvider=False),
       'issue-56-runner-source-deployment/*.png',
       {name: parent for name in ('js/src/cli/runner-profile.js',
                                  'js/src/web/settings-runner-profile.js',
                                  '.github/workflows/desktop-release.yml')})
