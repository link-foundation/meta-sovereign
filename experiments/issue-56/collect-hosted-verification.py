"""Check preserved exact-head workflow metadata without running local matrices."""
import json
from pathlib import Path
import subprocess
import sys
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
revision, slug = sys.argv[1:]
sha = subprocess.check_output(['git', 'rev-parse', revision], cwd=root).decode().strip()
paths = sorted((root / 'ci-logs').glob(f'hosted-verification-{slug}-*.json'))
assert len(paths) == 5, 'preserve all five workflow metadata files'
names = set()
jobs = 0
for path in paths:
    run = json.loads(path.read_text())
    assert run['headSha'] == sha and run['status'] == 'completed', path
    assert run['conclusion'] == 'success', path
    assert all(job['status'] == 'completed' and job['conclusion'] in
               ['success', 'skipped'] for job in run['jobs']), path
    names.add(run['name'])
    jobs += len(run['jobs'])
assert names == {'Checks and release', 'Desktop release', 'Deploy to GitHub Pages',
                 'Scheduled security audit', 'Broken Link Checker'}
entries = {str(path.relative_to(root)): path.read_bytes() for path in paths}
source = Path(__file__).resolve()
entries[str(source.relative_to(root))] = source.read_bytes()
entries['metadata.json'] = (json.dumps(dict(sha=sha, workflows=5, jobs=jobs,
                                          all_successful=True), indent=2) + '\n').encode()
write_entries_archive(root / f'docs/case-studies/issue-56/data/hosted-verification-{slug}.tar.gz', entries)
print(f'All five exact-head workflows and {jobs} jobs verified at {sha}')
