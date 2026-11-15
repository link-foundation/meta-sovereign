"""Archive the parent regression, parser experiment and focused CLI checks."""
import subprocess
from pathlib import Path
from evidence_bundle import evidence_logs, write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert 'fail 3' in (logs / 'lino-cli-arguments-regression-before.log').read_text()
assert 'fail 0' in (logs / 'lino-cli-arguments-focused.log').read_text()
files = [
    'js/src/cli/lino-args.js', 'js/src/cli/command-runner.js',
    'js/tests/lino-cli-arguments.test.js',
    'experiments/issue-56/lino-cli-arguments.mjs',
    'experiments/issue-56/collect-lino-cli-arguments.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/lino-cli-arguments.md',
    'docs/case-studies/issue-56/vk-desktop-execution-plan.md',
] + evidence_logs(root, 'lino-cli-arguments')
entries = {name: (root / name).read_bytes() for name in sorted(set(files))}
entries['before/js/src/cli/lino-args.js'] = subprocess.check_output(
    ['git', 'show', 'c4b904c3:js/src/cli/lino-args.js'], cwd=root)
entries['metadata.json'] = b'{"issue_complete": false, "hosted_verification_pending": true, "unchecked_required_rows": 60}\n'
write_entries_archive(root / 'docs/case-studies/issue-56/data/lino-cli-arguments.tar.gz', entries)
