"""Archive issue 52 CI evidence and immutable reference snapshots, sequentially."""

import argparse
import base64
import json
from pathlib import Path
import re
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'dev/log/issues/52/pulls/53'
REPO = 'link-foundation/meta-sovereign'
BRANCH = 'issue-52-966c0184cc29'
CITED = [40792195318, 40790641642, 40790638881, 40790628767,
         40790628783, 40790628774]


def gh_json(endpoint, paginated=False):
    args = ['gh', 'api', endpoint]
    if paginated:
        args += ['--paginate', '--slurp']
    return json.loads(subprocess.check_output(args))


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + '\n')


def runs(label, cited=False):
    pages = gh_json(f'repos/{REPO}/actions/runs?branch={BRANCH}&per_page=100', True)
    branch_runs = [run for page in pages for run in page['workflow_runs']]
    save(OUT / 'metadata' / f'branch-runs-{label}.json', branch_runs)
    collected = branch_runs
    if cited:
        collected = [gh_json(f'repos/{REPO}/actions/runs/{run}') for run in CITED] + collected
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT).decode().strip()
    for run in collected:
        print(run['id'], run['created_at'], run['head_sha'][:8], run['name'],
              run['status'], run['conclusion'], 'HEAD' if run['head_sha'] == head else '', flush=True)
        attempt = run['run_attempt']
        prefix = f'{run["id"]}-attempt{attempt}'
        save(OUT / 'metadata' / f'{prefix}.json', run)
        if run['status'] != 'completed':
            continue
        artifacts = gh_json(f'repos/{REPO}/actions/runs/{run["id"]}/artifacts?per_page=100', True)
        save(OUT / 'metadata' / f'{prefix}-artifacts.json', artifacts)
        for page in artifacts:
            for artifact in page['artifacts']:
                destination = OUT / 'artifacts' / f'{run["id"]}-{artifact["id"]}.zip'
                # Installers are publication outputs, not investigation logs.
                # Keep their API size/digest/URL; downloading every OS build on
                # every audit commit would make the evidence unreviewable.
                if artifact['name'].startswith('desktop-'):
                    continue
                if artifact['expired'] or destination.exists():
                    continue
                destination.parent.mkdir(parents=True, exist_ok=True)
                with destination.open('wb') as stream:
                    subprocess.run(['gh', 'api', f'repos/{REPO}/actions/artifacts/{artifact["id"]}/zip'], stdout=stream, check=True)
        log = OUT / 'ci-logs' / f'{prefix}.log'
        if log.exists() and log.stat().st_size > 1000:
            continue
        pages = gh_json(f'repos/{REPO}/actions/runs/{run["id"]}/jobs?per_page=100', True)
        jobs = [job for page in pages for job in page['jobs']]
        save(OUT / 'metadata' / f'{prefix}-jobs.json', jobs)
        annotations = []
        for job in jobs:
            if job.get('check_run_url'):
                endpoint = job['check_run_url'].replace('https://api.github.com/', '') + '/annotations?per_page=100'
                for page in gh_json(endpoint, True):
                    annotations.extend(dict(annotation, job_name=job['name']) for annotation in page)
        save(OUT / 'metadata' / f'{prefix}-annotations.json', annotations)
        with log.open('wb') as stream:
            result = subprocess.run(['gh', 'run', 'view', str(run['id']), '--repo', REPO,
                                     '--attempt', str(attempt), '--log'], stdout=stream,
                                    stderr=subprocess.STDOUT, check=False)
        if result.returncode:
            print('Log unavailable:', log, flush=True)


def templates():
    repos = ['link-foundation/js-ai-driven-development-pipeline-template',
             'link-foundation/rust-ai-driven-development-pipeline-template',
             'link-foundation/python-ai-driven-development-pipeline-template',
             'link-assistant/hive-mind']
    for repo in repos:
        name = repo.split('/')[-1]
        folder = OUT / ('research' if name == 'hive-mind' else 'templates') / name
        commit = gh_json(f'repos/{repo}/commits/HEAD')
        sha = commit['sha']
        save(folder / 'commit.json', commit)
        tree = gh_json(f'repos/{repo}/git/trees/{sha}?recursive=1')
        if tree.get('truncated'):
            raise RuntimeError(f'Incomplete tree: {repo}')
        save(folder / 'tree.json', tree)
        if name == 'hive-mind':
            doc = gh_json(f'repos/{repo}/contents/docs/CI-CD-BEST-PRACTICES.md?ref={sha}')
            (folder / 'CI-CD-BEST-PRACTICES.md').write_bytes(base64.b64decode(doc['content']))
            print(repo, sha, 'best-practices document', flush=True)
            continue
        archive = folder / 'source.tar.gz'
        with archive.open('wb') as stream:
            subprocess.run(['gh', 'api', f'repos/{repo}/tarball/{sha}'], stdout=stream, check=True)
        with tarfile.open(archive) as source:
            source.extractall(folder / 'source', filter='data')
        print(repo, sha, len(tree['tree']), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--label', default='progress')
    parser.add_argument('--cited', action='store_true')
    parser.add_argument('--templates', action='store_true')
    args = parser.parse_args()
    if not re.fullmatch('[a-z0-9-]+', args.label):
        raise ValueError('Invalid snapshot label')
    if args.templates:
        templates()
    runs(args.label, args.cited)
