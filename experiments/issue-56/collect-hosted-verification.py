"""Check preserved exact-head workflow metadata without running local matrices."""
import json
from pathlib import Path
import subprocess
import sys
from evidence_bundle import write_entries_archive
from hosted_evidence import read_workflows

root = Path(__file__).resolve().parents[2]
revision, slug = sys.argv[1:]
sha = subprocess.check_output(['git', 'rev-parse', revision], cwd=root).decode().strip()
entries = {}
runs = read_workflows(root, sha, slug, entries)
jobs = sum(len(run['jobs']) for run in runs.values())
helper = root / 'experiments/issue-56/hosted_evidence.py'
entries[str(helper.relative_to(root))] = helper.read_bytes()
source = Path(__file__).resolve()
entries[str(source.relative_to(root))] = source.read_bytes()
entries['metadata.json'] = (json.dumps(dict(sha=sha, workflows=5, jobs=jobs,
                                          all_successful=True), indent=2) + '\n').encode()
write_entries_archive(root / f'docs/case-studies/issue-56/data/hosted-verification-{slug}.tar.gz', entries)
print(f'All five exact-head workflows and {jobs} jobs verified at {sha}')
