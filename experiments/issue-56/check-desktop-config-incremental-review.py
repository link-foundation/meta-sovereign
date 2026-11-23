"""Finite refusal probes for an explicitly reviewed source delta."""
import argparse
import copy
import json
from pathlib import Path
from desktop_config_incremental_review import check_incremental_review

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--expected-files', type=int, default=2)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
prefix = root / 'ci-logs/desktop-configuration-criteria'
audit = json.loads(Path(f'{prefix}-source-audit.json').read_text())
review = json.loads(Path(f'{prefix}-source-review.json').read_text())
entries = {}
changes = check_incremental_review(root, audit, review, entries)
assert len(changes) == args.expected_files and len(entries) == 4
assert review['acceptance'] is False
refused = []
for kind in ['missing-source', 'source-hash', 'baseline-review', 'delta-hash',
             'baseline-revision', 'archive-integrity', 'archived-source']:
    changed_audit, changed_review = copy.deepcopy(audit), copy.deepcopy(review)
    proof = changed_review['incrementalSourceReview']
    if kind == 'missing-source':
        proof['reviewedSources'].pop()
    elif kind == 'source-hash':
        proof['reviewedSources'][0]['current'] = '0' * 64
    elif kind == 'baseline-review':
        proof['reviewSha256'] = '0' * 64
    elif kind == 'delta-hash':
        proof['diffSha256'] = '0' * 64
    elif kind == 'baseline-revision':
        proof['revision'] = '../untrusted'
    elif kind == 'archive-integrity':
        changed_audit['archives']['startup-configuration']['archiveSha256'] = '0' * 64
    else:
        source = next(iter(changed_audit['archives']['startup-configuration']['sources'].values()))
        source['archived'] = '0' * 64
    try:
        check_incremental_review(root, changed_audit, changed_review, {})
    except AssertionError:
        refused.append(kind)
    else:
        raise AssertionError(f'Accepted contradictory evidence: {kind}')
print(json.dumps(dict(reviewedFiles=len(changes), preservedBaselineFiles=3,
    refused=refused, acceptance=False, localMatrixRun=False)))
