"""Check each shared review server's real startup, counters and drained shutdown."""
import json
import os
from pathlib import Path
import subprocess
from urllib.request import urlopen

root = Path(__file__).resolve().parents[2]
for name, counter in [('cv-prepare', 'reviewWrites'),
                      ('cv-technology', 'reviewWrites'), ('technology', 'analyses')]:
    with (root / f'ci-logs/cv-fixture-{name}.log').open('w') as errors:
        child = subprocess.Popen(
            ['node', f'experiments/issue-56/{name}-mcp-server.mjs'], cwd=root,
            env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=384'),
            stdout=subprocess.PIPE, stderr=errors, text=True)
        try:
            address = json.loads(child.stdout.readline())
            assert address['pid'] == child.pid
            with urlopen(address['control']) as reply:
                counts = json.load(reply)
            assert counts['providerReads'] == counts[counter] == 0, counts
            assert counts['nativeProviderReads'] is False
            if name == 'cv-prepare':
                assert [counts[key] for key in ['attached', 'detached', 'prepared']] == [0, 0, 0]
            child.terminate()
            final, _ = child.communicate()
            assert child.returncode == 0, child.returncode
            assert json.loads(final) == counts
            print(f'{name}: startup, isolated counters and drained shutdown pass')
        finally:
            if child.poll() is None:
                child.terminate()
                child.communicate()
