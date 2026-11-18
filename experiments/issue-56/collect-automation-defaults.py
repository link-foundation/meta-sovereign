"""Preserve finite configuration checks without claiming the whole VD07 contract."""
import json
import subprocess
from evidence_bundle import (
    changed_sources, evidence_context, evidence_logs, verify_evidence,
    write_entries_archive,
)

root, logs, read = evidence_context(__file__, 'automation-defaults')
verify_evidence(read, {
    'final-parent': ['ℹ tests 10', 'ℹ pass 2', 'ℹ fail 8'],
    'final-focused': ['ℹ tests 13', 'ℹ pass 13', 'ℹ fail 0'],
    'settings-final': ['ℹ tests 21', 'ℹ pass 21', 'ℹ fail 0'],
    'startup-final': ['ℹ tests 13', 'ℹ pass 13', 'ℹ fail 0'],
    'format-check': ['All matched files use Prettier code style!'],
})
names = set(changed_sources(root))
names.update(evidence_logs(root, 'automation-defaults'))
names.update({
    'ci-logs/desktop-runner-reference-requirements-full.md',
    'ci-logs/vk-desktop-reference-README.md',
    'ci-logs/bot-configuration-reference-config.js',
    'ci-logs/bot-configuration-reference-store.js',
    'experiments/issue-56/evidence_bundle.py',
    'experiments/issue-56/previous-module.mjs',
})
entries = {name: (root / name).read_bytes() for name in sorted(names)}
parent = 'b98098b7d0b55d60557024eab21461068798641a'
for name in [
    'js/src/automation/vk-online-settings.js',
    'js/src/automation/vk-friends-settings.js',
    'js/src/automation/vk-maintenance-settings.js',
    'js/src/automation/vk-personal-settings.js',
    'js/src/cli/startup-configuration.js', 'js/src/cli/vk-online-commands.js',
    'js/src/cli/vk-friends-commands.js', 'js/src/cli/rolling-serve.js',
    'js/src/server/index.js',
]:
    entries[f'before/{name}'] = subprocess.check_output(
        ['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(
    parent=parent,
    reference='konard/vk-bot-desktop@8fbf3b7c42fd8e995ef137cab9b9653a7dc9b1a1',
    liveProvider=False, localFullMatrix=False, acceptedInventoryRows=[],
    issueComplete=False, hostedNewSource='required after publication',
), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/automation-defaults.tar.gz', entries)
