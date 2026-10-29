"""Reproduce release lockfile drift in an isolated fixture; never install code."""
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
out = root / 'dev/log/issues/52/pulls/53/research'
with tempfile.TemporaryDirectory(prefix='ms-issue52-lock-') as folder:
    fixture = Path(folder)
    for name in ['package.json', 'package-lock.json']:
        shutil.copy(root / name, fixture / name)
    data = json.loads((fixture / 'package.json').read_text())
    data['version'] = '1.0.0'
    (fixture / 'package.json').write_text(json.dumps(data, indent=2) + '\n')
    with (out / 'npm12-lock-reproduction.log').open('wb') as log:
        result = subprocess.run(['npm', 'exec', '--yes', '--package=npm@12.2.1', '--',
                                 'npm', 'install', '--package-lock-only', '--legacy-peer-deps',
                                 '--ignore-scripts', '--no-audit', '--no-fund'],
                                cwd=fixture, stdout=log, stderr=subprocess.STDOUT, check=False)
    if result.returncode:
        raise RuntimeError('Lockfile reproduction failed; inspect saved log')
    shutil.copy(fixture / 'package-lock.json', out / 'npm12-lock-after.json')
    before = json.loads((root / 'package-lock.json').read_text())
    after = json.loads((fixture / 'package-lock.json').read_text())
    changes = []
    def compare(old, new, key=''):
        if isinstance(old, dict) and isinstance(new, dict):
            for field in sorted(old.keys() | new.keys()):
                if field not in old or field not in new:
                    changes.append({'path': key + '/' + field, 'before': old.get(field), 'after': new.get(field)})
                else:
                    compare(old[field], new[field], key + '/' + field)
        elif old != new:
            changes.append({'path': key, 'before': old, 'after': new})
    compare(before, after)
    (out / 'lockfile-structural-diff.json').write_text(json.dumps(changes, indent=2) + '\n')
    print(json.dumps(changes, indent=2))
