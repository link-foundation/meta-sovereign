"""Two finite production-worker probes against the exact published parent."""
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
parent = '02303fc78b4fd0802c8c2686a3a6c567fa0cb2a1'
names = ['js/bin/server-worker.js', 'js/src/server/worker-client.js']
original = {name: (root / name).read_bytes() for name in names}
try:
    for name in names:
        (root / name).write_bytes(subprocess.check_output(
            ['git', 'show', f'{parent}:{name}'], cwd=root))
    log = root / 'ci-logs/worker-eof-before.log'
    with log.open('wb') as stream:
        result = subprocess.run([
            'node', '--max-old-space-size=384', '--test',
            '--test-concurrency=1', 'js/tests/worker-input-close.test.js'],
            cwd=root, stdout=stream, stderr=subprocess.STDOUT)
    report = log.read_text()
    assert result.returncode != 0
    assert 'Worker retained initialization after input EOF.' in report
    assert 'EPIPE' in report and 'fail 2' in report
    print('Published worker retains EOF initialization and crashes on EPIPE; both children drained.')
finally:
    for name, content in original.items():
        (root / name).write_bytes(content)
    assert all((root / name).read_bytes() == content for name, content in original.items())
