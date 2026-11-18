"""Preserve the separately reviewed four-criterion acceptance checkpoint."""
import hashlib
import json
from pathlib import Path
import tarfile
from evidence_bundle import write_entries_archive
from hosted_evidence import read_workflows

root = Path(__file__).resolve().parents[2]
slug = '6c20f4dc'
sha = '6c20f4dc7d8c4b3f0221f88068ab9bac5fd19e51'
entries = {}
runs = read_workflows(root, sha, slug, entries)
assert sum(len(run['jobs']) for run in runs.values()) == 78
assert sum(job['conclusion'] == 'success'
           for run in runs.values() for job in run['jobs']) == 72
archives = {}
for stem, criterion in [('salary-context', 'QA12'), ('option-choice', 'QA14'),
                        ('salary-band', 'QA15'), ('desktop-packaging', 'VD09')]:
    path = root / f'docs/case-studies/issue-56/data/{stem}-hosted-{slug}.tar.gz'
    manifest = path.with_suffix('').with_suffix('.tar.sha256.json')
    expected = json.loads(manifest.read_text())['files']
    with tarfile.open(path) as archive:
        actual = {entry.name: hashlib.sha256(archive.extractfile(entry).read()).hexdigest()
                  for entry in archive.getmembers() if entry.isfile()}
        data = json.load(archive.extractfile('metadata.json'))
    assert actual == expected and data['sha'] == sha and data['criterion'] == criterion
    assert data['acceptance'] is False
    archives[criterion] = dict(archive=path.name, entries=len(actual),
                              sha256=hashlib.sha256(path.read_bytes()).hexdigest())
    entries[str(manifest.relative_to(root))] = manifest.read_bytes()
names = ['experiments/issue-56/collect-criteria-review.py',
         'experiments/issue-56/hosted_evidence.py',
         'experiments/issue-56/evidence_bundle.py',
         'docs/case-studies/issue-56/hosted-criteria-6c20.md',
         'ci-logs/hosted-6c20f4dc-run-attempt.json']
for stem in ['salary-context', 'option-choice', 'salary-band', 'desktop-packaging']:
    names += [f'ci-logs/{stem}-hosted-{slug}.log',
              f'docs/case-studies/issue-56/{stem}-criteria-audit.md']
for job in [134149275650, 134149276901, 134149277084]:
    names += [f'ci-logs/hosted-{slug}-job-{job}{suffix}.json'
              for suffix in ['', '-annotations']]
for name in names:
    entries[name] = (root / name).read_bytes()
entries['metadata.json'] = (json.dumps(dict(
    sha=sha, reviewedCriteria=list(archives), archives=archives,
    integrityDoesNotMakeAcceptance=True, fullIssueComplete=False,
    verified=82, unchecked=36, liveProvider=False,
), indent=2) + '\n').encode()
write_entries_archive(root / f'docs/case-studies/issue-56/data/criteria-review-{slug}.tar.gz', entries)
