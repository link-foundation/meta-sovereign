"""Preserve exact published-parent failures while its last browser job runs."""
import json
from pathlib import Path
import re
import subprocess

root = Path(__file__).resolve().parents[2]
repo = 'link-foundation/meta-sovereign'
run = '43183721390'
metadata = subprocess.check_output(['gh', 'run', 'view', run, '--repo', repo,
    '--json', 'databaseId,conclusion,createdAt,headSha,status,jobs'], cwd=root)
(root / 'ci-logs/cv-watch-parent-checks.json').write_bytes(metadata)
result = json.loads(metadata)
print({key: result[key] for key in ['databaseId', 'createdAt', 'headSha', 'status', 'conclusion']}, flush=True)
for job in result['jobs']:
    if job['conclusion'] != 'failure':
        continue
    name = re.sub('[^a-z0-9]+', '-', job['name'].lower()).strip('-')
    path = root / f"ci-logs/cv-watch-parent-{name}-{job['databaseId']}.log"
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
    with (root / f'ci-logs/cv-watch-parent-checks-{run}.log').open('wb') as output:
        subprocess.run(['gh', 'run', 'view', run, '--repo', repo,
            '--log'], cwd=root, stdout=output,
            stderr=subprocess.STDOUT, check=True)
