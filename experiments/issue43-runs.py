"""Preserve all related workflow logs, metadata and check annotations sequentially.

Usage: python experiments/issue43-runs.py
Unfinished runs retain metadata and are collected on the next invocation.
Use repeatable --run-id to refresh only selected runs after the full collection.
"""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

REPO = 'link-foundation/meta-sovereign'
DEST = Path(__file__).resolve().parents[1] / 'dev/log/issues/43/pulls/44'


def gh(*args):
    return subprocess.check_output(['gh', *args])


def save(name, data):
    target = DEST / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)


def api(endpoint):
    return json.loads(gh('api', endpoint, '--paginate', '--slurp'))


def collect_diagnostic_artifacts():
    """Keep all small log/report artifacts; never duplicate native installers."""
    entries = {}
    names = {'browser-chromium', 'browser-webkit', 'package-diagnostics', 'link-report'}
    for metadata in sorted((DEST / 'github').glob('run-*-artifacts.json')):
        for page in json.loads(metadata.read_text()):
            for artifact in page.get('artifacts', []):
                if artifact['name'] in names:
                    entries[artifact['id']] = artifact
    inventory = []
    for artifact in entries.values():
        target = DEST / 'artifacts' / f"{artifact['name']}-{artifact['id']}.zip"
        row = {'id': artifact['id'], 'name': artifact['name'],
               'expected_digest': artifact.get('digest'), 'expired': artifact['expired'],
               'workflow_run': artifact.get('workflow_run')}
        if artifact['expired'] and not target.exists():
            row['unavailable'] = 'GitHub artifact expired before collection'
        else:
            assert artifact['size_in_bytes'] < 16 * 1024 * 1024, artifact['id']
            if not target.exists():
                save(str(target.relative_to(DEST)), gh('api', '--allow-escape-sequences',
                     f"repos/{REPO}/actions/artifacts/{artifact['id']}/zip"))
            actual = hashlib.sha256(target.read_bytes()).hexdigest()
            assert artifact.get('digest') == f'sha256:{actual}', artifact['id']
            row.update(path=str(target.relative_to(DEST)), sha256=actual)
        inventory.append(row)
    save('artifacts/diagnostic-inventory.json', json.dumps(inventory, indent=2).encode())
    checksums = ''.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n'
                        for p in sorted((DEST / 'artifacts').glob('*.zip')))
    save('artifacts/SHA256SUMS', checksums.encode())
    print(f'Collected/verified {len(inventory)} diagnostic log/report artifacts', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run-id', action='append', type=int)
    args = parser.parse_args()
    pages = api(f'repos/{REPO}/actions/runs?branch=issue-43-1924384484c0&per_page=100')
    runs = [run for page in pages for run in page['workflow_runs']]
    save('github/branch-runs.json', json.dumps(runs, indent=2).encode())
    ids = set(args.run_id) if args.run_id else {run['id'] for run in runs} | {40683241777, 40688263368, 40683241643, 40683241745}
    for run_id in sorted(ids):
        run = json.loads(gh('api', f'repos/{REPO}/actions/runs/{run_id}'))
        save(f'github/run-{run_id}.json', json.dumps(run, indent=2).encode())
        jobs = [job for page in api(f'repos/{REPO}/actions/runs/{run_id}/jobs?per_page=100') for job in page['jobs']]
        save(f'github/run-{run_id}-jobs.json', json.dumps(jobs, indent=2).encode())
        artifacts = api(f'repos/{REPO}/actions/runs/{run_id}/artifacts?per_page=100')
        save(f'github/run-{run_id}-artifacts.json', json.dumps(artifacts, indent=2).encode())
        if run['status'] != 'completed':
            print(f"Pending {run_id} {run['head_sha']}", flush=True)
            continue
        log = DEST / f'ci-logs/workflow-{run_id}.log'
        if not log.exists():
            with log.open('wb') as output:
                result = subprocess.run(['gh', 'run', 'view', str(run_id), '--repo', REPO, '--log'], stdout=output, stderr=subprocess.PIPE)
            if result.returncode:
                log.unlink(missing_ok=True)
                save(f'ci-logs/workflow-{run_id}-unavailable.txt', result.stderr)
        # A cancelled, never-started job can make the workflow log endpoint
        # unavailable even though completed job logs are still downloadable.
        if not log.exists():
            for job in jobs:
                if job['status'] != 'completed' or not job.get('steps'):
                    continue
                job_id = job['id']
                target = DEST / f'ci-logs/job-{job_id}.log'
                if target.exists():
                    continue
                result = subprocess.run(
                    ['gh', 'api', '--allow-escape-sequences',
                     f'repos/{REPO}/actions/jobs/{job_id}/logs'],
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                )
                if result.returncode:
                    save(f'ci-logs/job-{job_id}-unavailable.txt', result.stderr)
                else:
                    save(f'ci-logs/job-{job_id}.log', result.stdout)
        for job in jobs:
            check_id = job['check_run_url'].rsplit('/', 1)[-1]
            target = DEST / f'github/annotations/{check_id}.json'
            if target.exists():
                continue
            data = api(f'repos/{REPO}/check-runs/{check_id}/annotations?per_page=100')
            save(f'github/annotations/{check_id}.json', json.dumps(data, indent=2).encode())
        print(f"Collected {run_id} {run['head_sha']} {run['conclusion']}", flush=True)
    collect_diagnostic_artifacts()


if __name__ == '__main__':
    main()
