"""Preserve exact-parent missing controls and bounded shared CLI verification."""
import json
from pathlib import Path
import subprocess
from evidence_bundle import changed_sources, evidence_logs, verify_evidence, write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
read = lambda name: (logs / f'safety-cli-{name}.log').read_text()
verify_evidence(read, {
    'before': ['pass 1', 'fail 7'],
    'focused': ['pass 28', 'fail 0'],
    'format-check': ['All matched files use Prettier code style!'],
    'limits': ['0 over the 1500 line limit'],
}, empty=('lint', 'secrets', 'diff'))
names = [name for name in changed_sources(root) if not name.endswith(('PLAN.md', 'README.md'))]
names += ['js/src/automation/safety.js', 'js/src/automation/outbox.js',
          'js/src/storage/acknowledged-record.js', 'js/src/storage/serialized.js',
          'js/src/cli/index.js', 'js/src/cli/lino-args.js',
          'js/src/cli/command-runner.js', 'js/tests/automation-cli.test.js',
          'js/tests/safety-settings-acknowledgement.test.js',
          'experiments/issue-56/safety-settings-fixture.mjs',
          'experiments/issue-56/evidence_bundle.py', *evidence_logs(root, 'safety-cli')]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
parent = subprocess.check_output(['git', 'rev-parse', '757e241e'], cwd=root).decode().strip()
entries['before/js/src/cli/automation-commands.js'] = subprocess.check_output([
    'git', 'show', f'{parent}:js/src/cli/automation-commands.js'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(parent=parent, criterion='QA19',
    acceptance=False, acceptedCriteria=82, unfinishedCriteria=36,
    parentFailures=7, focusedPasses=28, liveProvider=False,
    hostedVerificationPending=True), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/safety-cli.tar.gz', entries)
