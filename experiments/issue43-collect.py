"""Collect authenticated, revision-pinned CI evidence. Never executes template code."""

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'dev/log/issues/43/pulls/44'


def gh(*args):
    return subprocess.check_output(['gh', *args])


def save(path, data):
    target = DEST / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)


def main():
    for language in ('js', 'rust', 'python'):
        repo = f'link-foundation/{language}-ai-driven-development-pipeline-template'
        revision = DEST / f'templates/{language}/revision.json'
        commit = json.loads(revision.read_text()) if revision.exists() else json.loads(gh('api', f'repos/{repo}/commits/HEAD'))
        sha = commit['sha']
        save(f'templates/{language}/revision.json', json.dumps(commit, indent=2).encode())
        tree = json.loads(gh('api', f'repos/{repo}/git/trees/{sha}?recursive=1'))
        assert not tree.get('truncated'), repo
        save(f'templates/{language}/tree.json', json.dumps(tree, indent=2).encode())
        for entry in tree['tree']:
            name = entry['path']
            if entry['type'] != 'blob':
                continue
            if (name.startswith(('.github/', 'scripts/', '.husky/', '.changeset/', 'tests/', 'test/', 'eslint-rules/')) or '/' not in name or name in ('docs/conf.py', 'docs/requirements.txt', 'docs/CI-TIMEOUT-BUDGETS.md', 'docs/ci-cd/troubleshooting.md')):
                if (DEST / f'templates/{language}/files/{name}').exists():
                    continue
                data = gh('api', f'repos/{repo}/contents/{name}?ref={sha}',
                          '-H', 'Accept: application/vnd.github.raw+json')
                save(f'templates/{language}/files/{name}', data)
        print(f'Collected {repo}@{sha}', flush=True)

    for run_id in (40688263368, 40683241643, 40683241745):
        save(f'ci-logs/run-{run_id}.log', gh('run', 'view', str(run_id),
             '--repo', 'link-foundation/meta-sovereign', '--log'))
        save(f'github/jobs-{run_id}.json', gh('api',
             f'repos/link-foundation/meta-sovereign/actions/runs/{run_id}/jobs', '--paginate'))
        print(f'Collected run {run_id}', flush=True)


if __name__ == '__main__':
    main()
