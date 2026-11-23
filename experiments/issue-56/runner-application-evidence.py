"""Archive the finite runner application reproduction and its verification."""
import hashlib
import json
from pathlib import Path

from evidence_bundle import evidence_context, write_hashed_archive


root, logs, read = evidence_context(__file__, 'runner-application')
assert "local: 'stopped'" in read('parent')
assert "local: 'running'" in read('parent')
assert 'pass 79' in read('node') and 'fail 0' in read('node')
assert '79 passed | 0 failed' in read('deno')
assert 'pass 12' in read('docker') and '12 passed | 0 failed' in read('docker')
assert not read('secrets').strip()
ssh = [json.loads(line) for line in read('native-ssh').splitlines()]
assert ssh[0]['missingApplicationBeforeDownload']
assert all(ssh[1][key] for key in ('actualSsh', 'nativeScreen',
                                  'coldAndWarmReady', 'stopConfirmed'))
parent = json.loads(read('browser-parent').splitlines()[-1])
current = json.loads(read('browser-current').splitlines()[-1])
assert parent['commands'] == [['local', 'stop'], ['server', 'start']]
assert parent['states'] == {'local': 'stopped', 'server': 'stopped'}
assert current['commands'] == []
assert current['states'] == {'local': 'running', 'server': 'stopped'}
assert parent['resourcesClosed'] and current['resourcesClosed']
before = json.loads((logs / 'runner-application-mcp-before.json').read_text())
after = json.loads((logs / 'runner-application-mcp-after.json').read_text())
assert before['notice'].startswith('The action was not confirmed.')
assert before['pageErrors'] == after['pageErrors'] == 0
observed = after['observed']
assert [item['locale'] for item in observed] == ['en', 'ru', 'hi', 'zh']
assert all(item['status'] == 200 and item['localRunning']
           and item['serverStopped'] and not item['overflow'] for item in observed)

sources = [
    'experiments/issue-56/runner-api-fixture.mjs',
    'experiments/issue-56/runner-application-browser.mjs',
    'experiments/issue-56/runner-application-evidence.py',
    'experiments/issue-56/runner-docker-fixture.mjs',
    'experiments/issue-56/runner-docker-hosted.mjs',
    'experiments/issue-56/runner-fixture.mjs',
    'experiments/issue-56/runner-node-local.mjs',
    'js/src/server/runner-control.js',
    'js/src/server/runner-session.js',
    'js/src/transport/runner-receipt.js',
    'js/src/web/locales/runner.js',
    'js/src/web/settings-runner.js',
    'js/tests/runner-api.test.js',
]
scripts = ['parent', 'node', 'deno', 'docker', 'native-ssh', 'browser-parent',
           'browser-current', 'web-build', 'lint', 'secrets']
shots = Path('docs/screenshots/issue-56-runner-application')
files = [*sources, *(str(path.relative_to(root)) for path in (root / shots).glob('*.png')),
         *(f'ci-logs/runner-application-{name}.log' for name in scripts),
         *(f'ci-logs/runner-application-mcp-{phase}.json' for phase in ('before', 'after'))]
metadata = {
    'parent': '3c1cf860a3333426c6f4ade582570888200c62cb',
    'productionBundleSha256': hashlib.sha256(
        (root / 'js/src/web/app.min.js').read_bytes()).hexdigest(),
    'scope': 'VD01 remains open. Local checks used owned fixtures.',
}
write_hashed_archive(root, root / 'docs/case-studies/issue-56/data/runner-application-preflight.tar.gz',
                     files, metadata, len(sources))
