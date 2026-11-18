"""Bind a manually reviewed finite delta to the original desktop source audit.

Run the archive audit first, read the complete incremental diff, then explicitly
name every reviewed changed file. This command does not establish acceptance.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
from desktop_config_incremental_review import changed_sources, check_incremental_review

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('revision')
parser.add_argument('--reviewed-path', action='append', required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
prefix = root / 'ci-logs/desktop-configuration-criteria'
baseline = f'{prefix}-b3364503'
old = json.loads(Path(f'{baseline}-source-audit.json').read_text())
audit_bytes = Path(f'{prefix}-source-audit.json').read_bytes()
audit = json.loads(audit_bytes)
sha = subprocess.check_output(['git', 'rev-parse', args.revision], cwd=root).decode().strip()
assert audit['revision'] == sha and audit['acceptance'] is False
changes = changed_sources(old['archives'], audit['archives'])
assert {change['path'] for change in changes} == {
    'js/src/cli/help.js', 'js/src/server/index.js'}, 'new changes require a fresh source review'
assert sorted(args.reviewed_path) == [change['path'] for change in changes]
delta = subprocess.check_output(['git', 'diff', '--no-ext-diff', '--no-renames',
    old['revision'], sha, '--', *args.reviewed_path], cwd=root)
Path(f'{prefix}-incremental-source-deltas.diff').write_bytes(delta)
pairs = sorted({(path, hashes['archived'], hashes['current'])
    for archive in audit['archives'].values()
    for path, hashes in archive['sources'].items() if hashes['changed']})
review = dict(revision=sha, acceptance=False,
    reviewedChangedSourcePairs=len(pairs),
    reviewedChangedFiles=len({path for path, _, _ in pairs}),
    auditSha256=hashlib.sha256(audit_bytes).hexdigest(),
    diffSha256=hashlib.sha256(Path(f'{prefix}-source-deltas.diff').read_bytes()).hexdigest(),
    method='Original complete source review plus an explicitly reviewed incremental '
        'comparison. CLI help adds the separate vacancy preview without changing '
        'configuration parsing. The shared sender receives the same selected store '
        'already used by connection loading and its browser; fresh acknowledged '
        'consent is checked without changing configuration precedence or logs. '
        'Hosted behavioral acceptance remains separate.',
    pairs=[dict(path=p, archived=a, current=c) for p, a, c in pairs],
    incrementalSourceReview=dict(revision=old['revision'],
        reviewSha256=hashlib.sha256(Path(f'{baseline}-source-review.json').read_bytes()).hexdigest(),
        diffSha256=hashlib.sha256(delta).hexdigest(), reviewedSources=changes))
entries = {}
check_incremental_review(root, audit, review, entries)
Path(f'{prefix}-source-review.json').write_text(json.dumps(review, indent=2) + '\n')
print(f"Reviewed {len(changes)} incremental files; {len(pairs)} current source pairs; acceptance remains false")
