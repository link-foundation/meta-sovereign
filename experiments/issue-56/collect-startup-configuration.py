"""Retain the bounded actual-dispatch regression and focused configuration checks."""
import subprocess
from pathlib import Path
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert '"observed":{"port":null,"verbose":null}' in (logs / 'startup-config-before.log').read_text()
assert 'AssertionError' in (logs / 'startup-config-before.log').read_text()
assert '"observed":{"port":9200,"verbose":false}' in (logs / 'startup-config-after.log').read_text()
assert not (logs / 'startup-config-lint.log').read_text().strip()
assert 'fail 0' in (logs / 'startup-config-focused.log').read_text()
names = [
    'js/src/cli/startup-configuration.js', 'js/src/cli/command-runner.js',
    'js/src/cli/help.js', 'js/tests/startup-configuration.test.js',
    'experiments/issue-56/startup-configuration.mjs',
    'experiments/issue-56/desktop-config-codec.mjs',
    'experiments/issue-56/collect-startup-configuration.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/SERVER-CONFIGURATION.md',
    'docs/case-studies/issue-56/startup-configuration.md',
    'ci-logs/startup-config-before.log', 'ci-logs/startup-config-after.log',
    'ci-logs/startup-config-focused.log', 'ci-logs/startup-config-lint.log',
    'ci-logs/startup-config-lint-config-missing.log',
    'ci-logs/desktop-config-codec.log',
]
entries = {name: (root / name).read_bytes() for name in names}
entries['before/js/src/cli/command-runner.js'] = subprocess.check_output(
    ['git', 'show', '36ee8ba8:js/src/cli/command-runner.js'], cwd=root)
entries['metadata.json'] = b'{"issue_complete":false,"desktop_config_complete":false,"before":"36ee8ba8"}\n'
write_entries_archive(root / 'docs/case-studies/issue-56/data/startup-configuration.tar.gz', entries)
