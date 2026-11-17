"""Read exact-source hosted workflow and job receipts without running a matrix."""
import json


def read_workflows(root, sha, slug, entries):
    runs = {}
    for path in sorted((root / 'ci-logs').glob(f'hosted-verification-{slug}-*.json')):
        run = json.loads(path.read_text())
        assert run['headSha'] == sha and run['status'] == 'completed', path
        assert run['conclusion'] == 'success', path
        assert all(job['status'] == 'completed' and job['conclusion'] in
                   ['success', 'skipped'] for job in run['jobs']), path
        assert run['name'] not in runs, 'duplicate workflow'
        runs[run['name']] = run
        entries[str(path.relative_to(root))] = path.read_bytes()
    assert set(runs) == {'Checks and release', 'Desktop release',
                         'Deploy to GitHub Pages', 'Scheduled security audit',
                         'Broken Link Checker'}, 'preserve all five workflows'
    return runs


def read_jobs(root, runs, slug, jobs, entries):
    raw = {}
    receipts = {}
    for tag, (workflow, name) in jobs.items():
        candidates = [job for job in runs[workflow]['jobs'] if job['name'] == name]
        assert len(candidates) == 1, (workflow, name)
        job = candidates[0]
        assert job['conclusion'] == 'success', name
        path = root / 'ci-logs' / f'hosted-{slug}-{tag}.log'
        entries[str(path.relative_to(root))] = path.read_bytes()
        raw[tag] = path.read_text().splitlines()
        receipts[tag] = {
            'id': job['databaseId'], 'name': name,
            'startedAt': job['startedAt'], 'completedAt': job['completedAt'],
            'url': job['url'], 'log': str(path.relative_to(root)),
        }
    return raw, receipts
