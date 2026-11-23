"""Preserve the current explicitly reviewed desktop configuration source chain."""
import argparse
import json
from pathlib import Path
import subprocess
from desktop_config_incremental_review import check_incremental_review
from evidence_bundle import write_entries_archive

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--audit-log', default='ci-logs/desktop-configuration-ef34179a-audit.log')
parser.add_argument('--output', default='docs/case-studies/issue-56/data/desktop-config-incremental-review.tar.gz')
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
prefix = 'ci-logs/desktop-configuration-criteria'
audit = json.loads((root / f'{prefix}-source-audit.json').read_text())
review = json.loads((root / f'{prefix}-source-review.json').read_text())
entries = {}
changes = check_incremental_review(root, audit, review, entries)
names = [f'{prefix}-{suffix}' for suffix in [
    'source-audit.json', 'source-deltas.diff', 'source-review.json']]
names += [f'experiments/issue-56/{name}' for name in [
    'collect-desktop-config-incremental-review.py', 'desktop_config_incremental_review.py',
    'extend-desktop-config-review.py', 'check-desktop-config-incremental-review.py',
    'collect-desktop-config-criteria-hosted.py', 'audit-hosted-criteria.py',
    'desktop-configuration-evidence.json', 'evidence_bundle.py', 'hosted_evidence.py']]
names += [f'ci-logs/{name}' for name in ['desktop-config-incremental-review.log',
    'desktop-config-incremental-refusals.log']]
names += [args.audit_log]
names += ['docs/case-studies/issue-56/desktop-configuration-criteria-audit.md',
          'docs/case-studies/issue-56/PLAN.md']
entries.update({name: (root / name).read_bytes() for name in names})
for change in changes:
    for label, revision in [('before', review['incrementalSourceReview']['revision']),
                            ('current', audit['revision'])]:
        entries[f'{label}/{change["path"]}'] = subprocess.check_output(
            ['git', 'show', f'{revision}:{change["path"]}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(revision=audit['revision'],
    baseline=review['incrementalSourceReview']['revision'], reviewedSources=changes,
    archiveEntries=sum(item['entries'] for item in audit['archives'].values()),
    reviewedSourcePairs=review['reviewedChangedSourcePairs'], acceptance=False,
    verifiedCriteria=88, unfinishedCriteria=30, fullIssueComplete=False), indent=2) + '\n').encode()
write_entries_archive(root / args.output, entries)
