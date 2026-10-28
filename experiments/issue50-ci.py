"""Preserve paginated PR CI metadata and completed non-passing run logs.

Run after each source push; use --label to retain independent snapshots.
Commands stream potentially large logs directly to disk, one run at a time.
"""
import argparse
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dev/log/issues/50/pulls/51'
REPO = 'link-foundation/meta-sovereign'
BRANCH = 'issue-50-d289f94d6edd'


def collect(label):
    if not re.fullmatch(r'[a-z0-9-]+', label):
        raise ValueError('Use a lowercase alphanumeric snapshot label')
    for group in ['github', 'ci-logs']:
        (OUT / group).mkdir(parents=True, exist_ok=True)
    pages = json.loads(subprocess.check_output([
        'gh', 'api', '--paginate', '--slurp',
        f'repos/{REPO}/actions/runs?branch={BRANCH}&per_page=100',
    ]))
    runs = [run for page in pages for run in page['workflow_runs']]
    (OUT / 'github' / f'ci-{label}.json').write_text(
        json.dumps(runs, indent=2) + '\n')
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT).decode().strip()
    failures = []
    for run in runs:
        if run['head_sha'] == head:
            print(run['id'], run['created_at'], head[:8], run['name'],
                  run['status'], run['conclusion'], flush=True)
        if run['status'] != 'completed' or run['conclusion'] in ['success', 'skipped']:
            continue
        name = re.sub(r'[^a-z0-9]+', '-', run['name'].lower()).strip('-')
        log = OUT / 'ci-logs' / f'{name}-{run["id"]}-attempt{run["run_attempt"]}.log'
        if log.exists() and log.stat().st_size:
            continue
        with log.open('wb') as output:
            result = subprocess.run([
                'gh', 'run', 'view', str(run['id']), '--repo', REPO,
                '--attempt', str(run['run_attempt']), '--log',
            ], stdout=output, stderr=subprocess.STDOUT, check=False)
        if result.returncode:
            failures.append(str(run['id']))
    if failures:
        print('Logs unavailable for these completed runs; reasons saved:', ', '.join(failures))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--label', default='progress')
    collect(parser.parse_args().label)
