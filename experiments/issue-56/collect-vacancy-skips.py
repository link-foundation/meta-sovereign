"""Bind the native-refusal unit to its actual sources and finite checks."""
from pathlib import Path
import json
import subprocess
from evidence_bundle import changed_sources, evidence_logs, write_entries_archive

root = Path(__file__).resolve().parents[2]
parent = 'e2acf88a7bdee8ba4df94015036b612463e7ebed'
names = changed_sources(root) + evidence_logs(root, 'vacancy-skips') + ['.jscpd.json']
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
for name in names:
    if name.startswith('js/src/') and subprocess.run(
        ['git', 'cat-file', '-e', f'{parent}:{name}'], cwd=root,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
        entries[f'before/{name}'] = subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root)
focused = entries['ci-logs/vacancy-skips-focused.log'].decode()
assert 'pass 62' in focused and 'fail 0' in focused
assert 'fail 12' in entries['ci-logs/vacancy-skips-before.log'].decode()
assert 'persisted refusal controls must survive' in entries['ci-logs/vacancy-skips-before-native.log'].decode()
native = json.loads(entries['ci-logs/vacancy-skips-native.log'])
assert native['clearPersisted'] and native['providerSubmissions'] == 0 and native['browsersClosed']
mcp = json.loads(entries['ci-logs/vacancy-skips-mcp.json'])
assert mcp['ownerValuesPreserved'] and mcp['clearPersisted'] and mcp['browserClosed']
assert mcp['providerSubmissions'] == 0 and mcp['errors'] == []
assert json.loads(entries['ci-logs/vacancy-skips-mcp-close.json'])['closed']
assert not entries['ci-logs/vacancy-skips-lint-final.log'].strip()
assert not entries['ci-logs/vacancy-skips-diff.log'].strip()
assert 'ERROR:' not in entries['ci-logs/vacancy-skips-duplication.log'].decode()
assert json.loads(entries['.jscpd.json'])['threshold'] == 6.5
entries['metadata.json'] = json.dumps({
    'parent': parent, 'criterion': 'partial HH05; remains unfinished',
    'focusedPass': 62, 'parentFailures': 12, 'providerSubmissions': 0,
    'fullPlatformValidation': 'hosted; not local acceptance',
}, indent=2).encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/vacancy-native-skips.tar.gz', entries)
