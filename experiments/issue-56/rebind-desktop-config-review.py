"""Carry a source review only when every audited byte and delta is unchanged.

This finite reader neither runs tests nor establishes hosted acceptance.
"""
import hashlib
import json
from pathlib import Path
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
prefix = root / 'ci-logs/desktop-configuration-criteria'
baseline = f'{prefix}-b3364503'
old_review = json.loads(Path(f'{baseline}-source-review.json').read_text())
old_audit = Path(f'{baseline}-source-audit.json').read_bytes()
old_delta = Path(f'{baseline}-source-deltas.diff').read_bytes()
assert hashlib.sha256(old_audit).hexdigest() == old_review['auditSha256']
assert hashlib.sha256(old_delta).hexdigest() == old_review['diffSha256']
new_audit = Path(f'{prefix}-source-audit.json').read_bytes()
new_delta = Path(f'{prefix}-source-deltas.diff').read_bytes()
old, new = json.loads(old_audit), json.loads(new_audit)
assert old['revision'] == old_review['revision']
assert new['acceptance'] is False and old_review['acceptance'] is False
assert old['archives'] == new['archives'], 'Changed source requires a new review'
assert old_delta.replace(old['revision'].encode(), new['revision'].encode()) == new_delta
review = dict(old_review, revision=new['revision'],
    auditSha256=hashlib.sha256(new_audit).hexdigest(),
    diffSha256=hashlib.sha256(new_delta).hexdigest(),
    unchangedSourceReview=dict(revision=old['revision'],
        reviewSha256=hashlib.sha256(
            Path(f'{baseline}-source-review.json').read_bytes()).hexdigest(),
        archives=len(new['archives']),
        entries=sum(row['entries'] for row in new['archives'].values())))
review['method'] += (' Every audited archive map, production source hash and '
    'delta line matches that review; only the selected Git revision changes. '
    'Hosted acceptance remains separate.')
Path(f'{prefix}-source-review.json').write_text(json.dumps(review, indent=2) + '\n')
print(f"Rebound {review['reviewedChangedSourcePairs']} reviewed source pairs "
      f"across {review['reviewedChangedFiles']} files to {new['revision']}")
names = [f'ci-logs/desktop-configuration-criteria{tag}-{suffix}'
    for tag in ['', '-b3364503']
    for suffix in ['source-audit.json', 'source-deltas.diff', 'source-review.json']]
names += ['experiments/issue-56/rebind-desktop-config-review.py',
          'experiments/issue-56/collect-desktop-config-criteria-hosted.py',
          'experiments/issue-56/audit-hosted-criteria.py',
          'experiments/issue-56/desktop-configuration-evidence.json',
          'experiments/issue-56/evidence_bundle.py',
          'ci-logs/desktop-configuration-criteria-audit-72dc9552.log',
          'ci-logs/desktop-config-rebind-pending.log',
          'docs/case-studies/issue-56/desktop-configuration-criteria-audit.md']
entries = {name: (root / name).read_bytes() for name in names}
entries['metadata.json'] = (json.dumps(dict(revision=new['revision'],
    unchangedReview=review['unchangedSourceReview'], acceptance=False,
    acceptedCriteria=88, unfinishedCriteria=30), indent=2) + '\n').encode()
write_entries_archive(root /
    'docs/case-studies/issue-56/data/desktop-config-review-rebind.tar.gz', entries)
