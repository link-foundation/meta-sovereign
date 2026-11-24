"""Preserve exact published-parent failures while its last browser job runs."""
import json
from pathlib import Path
import re
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
repo = 'link-foundation/meta-sovereign'
run = sys.argv[1] if len(sys.argv) > 1 else '43183721390'
prefix = sys.argv[2] if len(sys.argv) > 2 else 'cv-watch-parent'
assert run.isdecimal() and re.fullmatch('[a-z0-9-]+', prefix)
metadata = subprocess.check_output(['gh', 'run', 'view', run, '--repo', repo,
    '--json', 'databaseId,conclusion,createdAt,headSha,status,jobs'], cwd=root)
(root / f'ci-logs/{prefix}-checks.json').write_bytes(metadata)
result = json.loads(metadata)
if len(sys.argv) > 3:
    assert result['headSha'] == sys.argv[3], 'Wrong published commit'
print({key: result[key] for key in ['databaseId', 'createdAt', 'headSha', 'status', 'conclusion']}, flush=True)
for job in result['jobs']:
    if job['conclusion'] != 'failure':
        continue
    name = re.sub('[^a-z0-9]+', '-', job['name'].lower()).strip('-')
    path = root / f"ci-logs/{prefix}-{name}-{job['databaseId']}.log"
    if not path.exists() or path.stat().st_size < 1000:
        with path.open('wb') as output:
            subprocess.run(['gh', 'api', '--allow-escape-sequences',
                f"repos/{repo}/actions/jobs/{job['databaseId']}/logs"], cwd=root,
                stdout=output, stderr=subprocess.STDOUT, check=True)
    lines = path.read_text().splitlines()
    failures = [(index + 1, line) for index, line in enumerate(lines)
        if re.search(r'✖|AssertionError|\] FAIL|error: Test failed|FAILURES', line)]
    print(path.name, job['name'], failures[-5:], flush=True)
if result['status'] == 'completed':
    with (root / f'ci-logs/{prefix}-checks-{run}.log').open('wb') as output:
        subprocess.run(['gh', 'run', 'view', run, '--repo', repo,
            '--log'], cwd=root, stdout=output,
            stderr=subprocess.STDOUT, check=True)
