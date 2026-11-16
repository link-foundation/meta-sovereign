"""Preserve the actual two-panel CI failure and bounded corrected scenarios."""
import json
from pathlib import Path
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
entries = {}
for name in ['ci-bf15-chromium3-133562826705.log',
             'publication-panel-before.log', 'publication-panel-reproduction.log',
             'publication-panel-after.log', 'publication-panel-lint.log',
             'publication-panel-format.log', 'publication-panel-mcp-scope.json',
             'publication-panel-mcp-plan.json', 'publication-panel-mcp-server.log']:
    entries[f'ci-logs/{name}'] = (logs / name).read_bytes()
assert b'resolved to 2 elements' in entries['ci-logs/publication-panel-before.log']
assert b'resolved to 2 elements' in entries['ci-logs/ci-bf15-chromium3-133562826705.log']
after = entries['ci-logs/publication-panel-after.log'].decode().splitlines()
receipts = [json.loads(line.split('[browser-scenario] ', 1)[1])
            for line in after if '[browser-scenario] ' in line]
passed = {r['scenario']: r['result'] for r in receipts if r['phase'] == 'passed'}
assert set(passed) == {'verifyCvSnapshotPublication', 'verifyNativeExportPublication',
                       'verifyExperiencePublication'}
assert len(receipts) == 6 and all(r['locales'] == 4 and r['providerSessions'] == 0
                                and r['recoveryReplayed'] is False
                                for r in passed.values())
assert not entries['ci-logs/publication-panel-lint.log'].strip()
assert b'All matched files use Prettier code style!' in entries['ci-logs/publication-panel-format.log']
assert json.loads(entries['ci-logs/publication-panel-mcp-scope.json']) == dict(
    publicationPanels=2, nativeSavePanels=1, experiencePanels=1, states=['none', 'none'])
assert json.loads(entries['ci-logs/publication-panel-mcp-plan.json']) == dict(
    nativeSavePanels=1, experiencePanels=1, nativeState='planned',
    experienceState='none', publishDisabled=True)
closed = json.loads(entries['ci-logs/publication-panel-mcp-server.log'].splitlines()[-1])
assert closed['pushes'] == 0 and closed['resourcesClosed'] is True
assert closed['privateOriginalsPreserved'] is True and closed['realProvider'] is False
parent = '9d31c3e71cd811371f91cbe0a33b193c5a518039'
for name in ['js/tests/helpers/e2e-cv-publication.mjs',
             'js/tests/helpers/e2e-cv-publication-exports.mjs']:
    entries[name] = (root / name).read_bytes()
    entries[f'before/{name}'] = subprocess.check_output(
        ['git', 'show', f'{parent}:{name}'], cwd=root)
for name in ['experiments/issue-56/publication-panel-before.py',
             'experiments/issue-56/collect-publication-panels.py',
             'docs/case-studies/issue-56/ci-publication-panels.md',
             'docs/screenshots/issue-56-publication-panels/native-review.png',
             'docs/screenshots/issue-56-publication-panels/independent-panels.png',
             '.playwright-mcp/console-2026-11-16T20-11-24-978Z.log']:
    entries[name] = (root / name).read_bytes()
entries['metadata.json'] = (json.dumps(dict(
    parent=parent, failedHostedJob=133562826705, failedHostedRun=43941245198,
    focusedNativeScenarios=passed, fixtureClosed=closed, liveProvider=False,
    hostedVerificationPending=True, acceptance=False), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-publication-panels.tar.gz', entries)
