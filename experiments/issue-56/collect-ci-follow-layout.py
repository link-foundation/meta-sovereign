"""Check and preserve exact hosted target miss and native keyboard regressions."""
import json
from pathlib import Path
import subprocess
from evidence_bundle import changed_sources, evidence_logs, write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert 'Published native opener fails' in (logs / 'ci-follow-layout-before-check.log').read_text()
assert json.loads((logs / 'ci-follow-layout-native.log').read_text()) == {
    'missedPointerReproduced': True, 'nativeKeyboardOpened': True,
    'repeatedOpeningPreservedDraft': True, 'errors': [], 'providerEffects': 0,
}
assert '[e2e-follow-telegram-backlinks] OK (webkit)' in (logs / 'ci-follow-layout-telegram.log').read_text()
result = json.loads((logs / 'ci-follow-layout-mcp.json').read_text())
assert not result.get('isError')
summary = json.loads(result['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert summary == {
    'nativeKeyboardOpened': True, 'repeatedOpeningPreservedDraft': True,
    'errors': [], 'liveProvider': False,
}
assert json.loads((logs / 'ci-follow-layout-server.log').read_text().splitlines()[-1]) == {'writes': []}
for suffix in ['lint', 'secrets', 'diff']:
    assert not (logs / f'ci-follow-layout-{suffix}.log').read_text().strip()
parent = subprocess.check_output(['git', 'rev-parse', '03827286'], cwd=root, text=True).strip()
names = changed_sources(root, revision=parent) + evidence_logs(root, 'ci-follow-layout')
names += ['ci-logs/ci-follow-layout-mcp-code.js',
          'ci-logs/checks-43793268260-webkit3.log',
          'ci-logs/checks-43793268260-pipeline.log',
          'ci-logs/ci-bea-runs.json', 'ci-logs/hosted-verification-bea-main.json',
          'experiments/issue-56/evidence_bundle.py',
          'experiments/issue-56/telegram-backlinks-ui.mjs']
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
for name in names:
    if name.startswith('js/tests/'):
        found = subprocess.run(['git', 'show', f'{parent}:{name}'], cwd=root,
                               stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, check=False)
        if found.returncode == 0:
            entries[f'before/{name}'] = found.stdout
entries['metadata.json'] = (json.dumps({
    'parent': parent, 'issue_complete': False, 'remaining_rows': 60,
    'hosted_failure_revision': 'bea3183ee94d04d0cb51b3961b0db08d84ef01c7',
    'injected_coordinate_shift_px': 21, 'original_render_timing_reproduced': False,
    'node_heap_mib': 384, 'live_provider_effects': 0,
    'hosted_acceptance': 'pending',
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-follow-layout.tar.gz', entries)
