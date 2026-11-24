"""Preserve the exact failed formatting gate and its bounded correction."""
from pathlib import Path
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
parent = 'ff8cfc1026f88ca095261d1729dd1264b862cfd6'
plan = 'docs/case-studies/issue-56/PLAN.md'
names = [plan, 'docs/case-studies/issue-56/ci-plan-format.md',
         'ci-logs/checks-43798379362-lint.log',
         'ci-logs/ci-ff8c-main-progress.json',
         'ci-logs/ci-ff8c-plan-check.log',
         'experiments/issue-56/collect-ci-plan-format.py']
assert len((root / plan).read_text().splitlines()) == 1500
assert 'All matched files use Prettier code style!' in (root / names[4]).read_text()
entries = {name: (root / name).read_bytes() for name in names}
entries[f'before/{plan}'] = subprocess.check_output(
    ['git', 'show', f'{parent}:{plan}'], cwd=root)
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-plan-format.tar.gz', entries)
