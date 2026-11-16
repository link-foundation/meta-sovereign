"""Bind criterion evidence to successful exact-source hosted jobs.

Run after preserving all five workflow responses and the seven named raw job
logs. This does not run a local matrix or complete an inventory criterion.
The original behavior mapping and source differences still require review.
"""
import ast
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
revision, slug = sys.argv[1:]
sha = subprocess.check_output(['git', 'rev-parse', revision], cwd=root).decode().strip()
logs = root / 'ci-logs'
runs = {}
entries = {}
for path in sorted(logs.glob(f'hosted-verification-{slug}-*.json')):
    run = json.loads(path.read_text())
    assert run['headSha'] == sha and run['status'] == 'completed', path
    assert run['conclusion'] == 'success', path
    assert all(job['status'] == 'completed' and job['conclusion'] in
               ['success', 'skipped'] for job in run['jobs']), path
    assert run['name'] not in runs, 'duplicate workflow'
    runs[run['name']] = run
    entries[str(path.relative_to(root))] = path.read_bytes()
assert set(runs) == {'Checks and release', 'Desktop release',
                     'Deploy to GitHub Pages', 'Scheduled security audit',
                     'Broken Link Checker'}, 'preserve all five workflows'

jobs = {
    'node': ('Checks and release', 'Test (node on ubuntu-26.04)'),
    'codeql': ('Checks and release', 'CodeQL (javascript-typescript)'),
    'electron': ('Desktop release', 'Build (linux-x64)'),
    'chromium-3': ('Checks and release', 'Browser e2e (chromium, shard 3/4)'),
    'chromium-4': ('Checks and release', 'Browser e2e (chromium, shard 4/4)'),
    'webkit-3': ('Checks and release', 'Browser e2e (webkit, shard 3/4)'),
    'webkit-4': ('Checks and release', 'Browser e2e (webkit, shard 4/4)'),
}
raw = {}
job_receipts = {}
for tag, (workflow, name) in jobs.items():
    candidates = [job for job in runs[workflow]['jobs'] if job['name'] == name]
    assert len(candidates) == 1, (workflow, name)
    job = candidates[0]
    assert job['conclusion'] == 'success', name
    path = logs / f'hosted-{slug}-{tag}.log'
    entries[str(path.relative_to(root))] = path.read_bytes()
    raw[tag] = path.read_text().splitlines()
    job_receipts[tag] = {
        'id': job['databaseId'], 'name': name,
        'startedAt': job['startedAt'], 'completedAt': job['completedAt'],
        'url': job['url'], 'log': str(path.relative_to(root)),
    }

audit_path = logs / 'hosted-criteria-source-audit.json'
audit = json.loads(audit_path.read_text())
assert audit['revision'] == sha, 'source audit must match the published revision'
for archive in audit['archives'].values():
    for path, hashes in archive['sources'].items():
        content = subprocess.check_output(['git', 'show', f'{sha}:{path}'], cwd=root)
        assert hashlib.sha256(content).hexdigest() == hashes['current'], path

test_files = [
    'vk-friend-stats', 'vk-friend-stats-feed', 'vk-friend-priority',
    'vk-discovery', 'vk-discovery-capability', 'vk-discovery-guards',
    'vk-discovery-interfaces', 'vk-stickers', 'vk-sticker-interfaces',
    'vk-outgoing-queue', 'vk-queue-interfaces', 'vk-queue-runner',
    'vk-queue-lifecycle', 'automation-trigger-state', 'vk-live-history',
    'runner-log', 'vk-message-defaults', 'vk-token-acquisition',
    'vk-token-authorization', 'vk-token-api', 'vk-token-electron-entry',
    'runner-view',
    'cv-formal-report', 'cv-formal-report-github', 'cv-formal-report-surfaces',
]
literal_test = re.compile(r'''\btest\(\s*((?:'(?:\\.|[^'\\])*')|(?:"(?:\\.|[^"\\])*"))\s*,''')
test_receipts = {}
for stem in test_files:
    path = f'js/tests/{stem}.test.js'
    content = subprocess.check_output(['git', 'show', f'{sha}:{path}'], cwd=root)
    entries[path] = content
    names = [ast.literal_eval(match.group(1)) for match in
             literal_test.finditer(content.decode())]
    assert names, f'no literal named tests: {path}'
    positive = {}
    for name in names:
        matches = [i for i, line in enumerate(raw['node'], 1)
                   if f'✔ {name} (' in line]
        assert len(matches) == 1, (path, name, matches)
        positive[name] = matches[0]
    test_receipts[path] = positive
assert any('ℹ fail 0' in line for line in raw['node']), 'Node failed'

scenarios = {
    'vk-friends': ['verifyVkFriendPriority', 'verifyVkFriendStats',
                   'verifyVkDiscovery', 'verifyVkStickers',
                   'verifyVkSendQueue', 'verifyRunnerLog'],
    'vk-token': ['verifyVkToken', 'verifyRunnerSessions', 'verifyRunnerProfile',
                 'verifyRunnerHealth', 'verifyRunnerFeedback'],
    'vk-engagement': ['verifyVkMessageDefaults'],
    'cv-translation': ['verifyCvFormalReports'],
}
browser_receipts = {}
for engine in ['chromium', 'webkit']:
    for group, names in scenarios.items():
        shard = 3 if group in ['vk-token', 'cv-translation'] else 4
        tag = f'{engine}-{shard}'
        assert any(f'[e2e-{group}] OK ({engine})' in line for line in raw[tag]), tag
        for name in names:
            matches = []
            for i, line in enumerate(raw[tag], 1):
                if '[browser-scenario] ' not in line:
                    continue
                value = json.loads(line.split('[browser-scenario] ', 1)[1])
                if (value['group'], value['scenario'], value['phase']) == (group, name, 'passed'):
                    matches.append({'line': i, 'receipt': value})
            assert len(matches) == 1, (tag, group, name)
            browser_receipts[f'{engine}/{group}/{name}'] = matches[0]

electron = [json.loads(line[line.index('{'):]) for line in raw['electron']
            if '"nativeElectron":true' in line]
assert len(electron) == 1
for name in ['nativeElectron', 'mainFrameCapture', 'protectedPreferences',
             'ephemeralSessionCleared']:
    assert electron[0][name] is True, name
assert electron[0]['liveProvider'] is False
codeql = [json.loads(line[line.index('{'):]) for line in raw['codeql']
          if '"auditedFalsePositives"' in line]
assert codeql == [{'reports': 1, 'auditedFalsePositives': 2}]

for name in ['hosted-criteria-source-audit.json', 'hosted-criteria-source-deltas.diff']:
    path = logs / name
    entries[str(path.relative_to(root))] = path.read_bytes()
for name in ['hosted-criteria-audit.md', 'hosted-criteria-plan.md']:
    path = root / 'docs/case-studies/issue-56' / name
    entries[str(path.relative_to(root))] = path.read_bytes()
for name in ['audit-hosted-criteria.py', 'collect-hosted-criteria.py', 'evidence_bundle.py']:
    path = root / 'experiments/issue-56' / name
    entries[str(path.relative_to(root))] = path.read_bytes()
metadata = dict(
    sha=sha, workflows=5, jobs=job_receipts, namedTests=test_receipts,
    browserScenarios=browser_receipts, electron=electron[0], codeql=codeql[0],
    auditedCriteria=['VK23', 'VK25', 'VK26', 'VD11', 'VD12', 'VD13', 'VD14', 'VD15'],
    unfinishedCacheInvestigation='VK24', liveProvider=False, acceptance=False,
)
entries['metadata.json'] = (json.dumps(metadata, indent=2) + '\n').encode()
write_entries_archive(root / f'docs/case-studies/issue-56/data/hosted-criteria-{slug}.tar.gz', entries)
print(f'Verified {sum(map(len, test_receipts.values()))} named tests, '
      f'{len(browser_receipts)} browser scenarios and native Electron at {sha}')
