"""Bind criterion evidence to successful exact-source hosted jobs.

Run after preserving all five workflow responses and the eleven named raw job
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
    'chromium-1': ('Checks and release', 'Browser e2e (chromium, shard 1/4)'),
    'chromium-2': ('Checks and release', 'Browser e2e (chromium, shard 2/4)'),
    'chromium-3': ('Checks and release', 'Browser e2e (chromium, shard 3/4)'),
    'chromium-4': ('Checks and release', 'Browser e2e (chromium, shard 4/4)'),
    'webkit-1': ('Checks and release', 'Browser e2e (webkit, shard 1/4)'),
    'webkit-2': ('Checks and release', 'Browser e2e (webkit, shard 2/4)'),
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
    'vk-cache', 'vk-cache-interfaces', 'telegram-export-window',
    'vk-outgoing-queue', 'vk-queue-interfaces', 'vk-queue-runner',
    'vk-queue-lifecycle', 'automation-trigger-state', 'vk-live-history',
    'runner-log', 'vk-message-defaults', 'vk-token-acquisition',
    'vk-token-authorization', 'vk-token-api', 'vk-token-electron-entry',
    'runner-view',
    'diagnostics', 'desktop-clipboard',
    'cv-formal-report', 'cv-formal-report-github', 'cv-formal-report-surfaces',
    'question-lists', 'question-lists-controls', 'questionnaire-index',
    'question-assembly-context', 'forms-questionnaire-learning',
    'job-application-answer-context', 'job-application-answer-context-controls',
    'job-application-answer-approval',
    'question-turns', 'question-turns-controls', 'question-policy',
    'question-corrections', 'question-corrections-controls',
    'question-concurrency', 'question-concurrency-controls',
    'question-controls', 'question-substitution', 'question-automation',
    'cv-publication', 'cv-publication-boundaries', 'cv-publication-controls',
    'cv-publication-exports', 'cv-publication-experience',
    'cv-publication-long-paths',
    'forms-answer-plan', 'forms-report', 'forms-markdown', 'forms-journal',
    'forms-model-review', 'answer-model-drafts', 'answer-model-api',
]
literal_test = re.compile(r'''\btest\(\s*((?:'(?:\\.|[^'\\])*')|(?:"(?:\\.|[^"\\])*"))\s*,''')
test_receipts = {}
for stem in test_files:
    path = f'js/tests/{stem}.test.js'
    content = subprocess.check_output(['git', 'show', f'{sha}:{path}'], cwd=root)
    entries[path] = content
    names = [ast.literal_eval(match.group(1)) for match in
             literal_test.finditer(content.decode())]
    if stem in ['cv-publication-controls', 'cv-publication-exports',
                'cv-publication-experience']:
        templates = re.findall(r'\btest\(\s*`([^`]+\$\{type\}[^`]*)`\s*,',
                               content.decode())
        assert len(templates) == 1, path
        names.extend(templates[0].replace('${type}', kind) for kind in
                     ['text/lino', 'application/lino-binary'])
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
                   'verifyVkSendQueue', 'verifyRunnerLog',
                   'verifyDiagnostics', 'verifyDesktopClipboard',
                   'verifyVkCache'],
    'vk-token': ['verifyVkToken', 'verifyRunnerSessions', 'verifyRunnerProfile',
                 'verifyRunnerHealth', 'verifyRunnerFeedback'],
    'vk-engagement': ['verifyVkMessageDefaults'],
    'cv-translation': ['verifyCvFormalReports'],
    'questions': ['saved-questionnaire-index'],
    'cv-snapshot-publication': ['verifyCvSnapshotPublication',
                                'verifyNativeExportPublication',
                                'verifyExperiencePublication'],
    'job-application-answers': ['verifyNativeApplicationAnswerApproval',
                                'verifyNativeApplicationAnswerContext'],
}
browser_receipts = {}
question_entry = 'js/tests/e2e-questions-browser.mjs'
question_source = subprocess.check_output(
    ['git', 'show', f'{sha}:{question_entry}'], cwd=root)
entries[question_entry] = question_source
question_assertions = {
    'verifyPolicy': None,
    'verifyQuestionTurns': 'e2e-question-turns',
    'verifyQuestionCorrections': 'e2e-question-corrections',
    'verifyQuestionConcurrency': 'e2e-question-concurrency',
}
for name, helper in question_assertions.items():
    assert len(re.findall(rf'^  await {name}\(', question_source.decode(), re.M)) == 1, name
    if helper:
        path = f'js/tests/helpers/{helper}.mjs'
        entries[path] = subprocess.check_output(
            ['git', 'show', f'{sha}:{path}'], cwd=root)
for path in ['js/tests/e2e-cv-publication-browser.mjs',
             'js/tests/helpers/e2e-cv-publication.mjs',
             'js/tests/helpers/e2e-cv-publication-exports.mjs',
             'js/tests/helpers/e2e-cv-publication-experience.mjs']:
    entries[path] = subprocess.check_output(
        ['git', 'show', f'{sha}:{path}'], cwd=root)
form_entry = 'js/tests/e2e-forms-reader-browser.mjs'
form_source = subprocess.check_output(
    ['git', 'show', f'{sha}:{form_entry}'], cwd=root)
entries[form_entry] = form_source
assert 'await verifyFormPlanUi({ page, report, owned });' in form_source.decode()
for helper in ['plans', 'journal', 'model']:
    path = f'js/tests/helpers/e2e-form-{helper}.mjs'
    entries[path] = subprocess.check_output(
        ['git', 'show', f'{sha}:{path}'], cwd=root)
for engine in ['chromium', 'webkit']:
    # These older assertions precede the group's final success marker and have
    # no separate scenario envelope. Retain their exact published bodies and
    # identify group completion honestly instead of inventing semantic logs.
    completions = [i for i, line in enumerate(raw[f'{engine}-3'], 1)
                   if f'[e2e-questions] OK ({engine})' in line]
    assert len(completions) == 1, engine
    browser_receipts[f'{engine}/questions/mandatory-assertions'] = dict(
        groupPassedLine=completions[0], entry=question_entry,
        awaited=list(question_assertions), kind='group-completion')
    # The report plan and journal assertions predate semantic envelopes. Bind
    # their published bodies to the actual required group/scenario completion.
    completions = [i for i, line in enumerate(raw[f'{engine}-4'], 1)
                   if f'[e2e-forms-reader] OK ({engine})' in line]
    assert len(completions) == 1, engine
    browser_receipts[f'{engine}/forms-reader/provenance-plan'] = dict(
        groupPassedLine=completions[0], entry=form_entry,
        awaited='verifyFormPlanUi', kind='group-completion')
    for name in ['verifyFormJournalUi', 'verifyFormModelUi']:
        completions = [i for i, line in enumerate(raw[f'{engine}-1'], 1)
                       if re.search(rf'\[forms-scenario\] {name} \d+$', line)]
        assert len(completions) == 1, (engine, name)
        browser_receipts[f'{engine}/forms-learning/{name}'] = dict(
            passedLine=completions[0], entry=form_entry,
            kind='awaited-scenario-completion')
    model = [(i, json.loads(line.split('[forms-model] ', 1)[1]))
             for i, line in enumerate(raw[f'{engine}-1'], 1)
             if '[forms-model] ' in line]
    assert len(model) == 1, engine
    line, receipt = model[0]
    assert receipt == dict(calls=1, applied=True, clarification=True,
                           stalePreserved=True, ownerPreserved=True,
                           closed=True, submits=0)
    browser_receipts[f'{engine}/forms-learning/model-provenance'] = dict(
        line=line, receipt=receipt)
    for group, names in scenarios.items():
        shard = (2 if group == 'job-application-answers' else
                 3 if group in ['vk-token', 'cv-translation', 'questions',
                                'cv-snapshot-publication'] else 4)
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
            result = matches[0]['receipt'].get('result')
            if name == 'verifyNativeApplicationAnswerContext':
                assert result['components'] == result['locales'] == 4
                assert result['automaticWrites'] == result['automaticSubmissions'] == 0
                assert result['reviewedSubmissions'] == 1
                assert result['identityOnlyRecovery'] is True
                assert result['ownedBrowserClosed'] is True and result['errors'] == []
            elif name == 'verifyNativeApplicationAnswerApproval':
                assert {receipt['name'] for receipt in result} == {'whole', 'unapproved', 'conflicting'}
                assert len(result) == 3
                assert all(receipt['automaticWrites'] == receipt['automaticSubmissions'] == 0
                           and receipt['reviewedSubmissions'] == 1
                           and receipt['ownedBrowserClosed'] is True for receipt in result)
            elif group == 'cv-snapshot-publication':
                assert result['providerSessions'] == 0 and result['locales'] == 4
                assert result['recoveryReplayed'] is False
                if name == 'verifyCvSnapshotPublication':
                    assert result['localSnapshotPushes'] == 2
                    assert result['privateIndexPreserved'] is True
                else:
                    assert result['localPushes'] == 1
                    if name == 'verifyNativeExportPublication':
                        assert result['nativeExportSource'] is True
                        assert result['privateExportPreserved'] is True
                    else:
                        assert result['experiencePublication'] is True
                        assert result['privateOriginalsPreserved'] == 2
            browser_receipts[f'{engine}/{group}/{name}'] = matches[0]

    # These older shared scenarios emit explicit result records, rather than
    # traceBrowserScenario envelopes. Require their actual semantic receipts.
    for group, shard, marker in [
        ('questions', 3, 'questionnaire-index'),
        ('forms-reader', 4, 'forms-questionnaire'),
        ('forms-learning', 1, 'forms-questionnaire-learning'),
    ]:
        lines = raw[f'{engine}-{shard}']
        assert any(f'[e2e-{group}] OK ({engine})' in line for line in lines), group
        matches = [(i, json.loads(line.split(f'[{marker}] ', 1)[1]))
                   for i, line in enumerate(lines, 1) if f'[{marker}] ' in line]
        assert len(matches) == 1, (engine, marker)
        line, receipt = matches[0]
        if marker == 'questionnaire-index':
            assert all(receipt[key] is True for key in
                       ['indexedExisting', 'previewReadOnly', 'backfilled', 'requiresReview'])
            assert receipt['savedOnlyCount'] == receipt['providerWrites'] == 0
        elif marker == 'forms-questionnaire':
            assert receipt == dict(controls=2, parts=3, requiresReview=True,
                                   providerWrites=0, closed=True)
        else:
            assert receipt['saved'] == len(receipt['rules']) == 3
            assert receipt['skipped'] == 0 and receipt['submissions'] == 1
            assert receipt['closed'] is True and receipt['overflow'] is False
            assert all(answer['count'] == 1 and answer['approved'] is False
                       for rule in receipt['rules'] for answer in rule['answers'])
        browser_receipts[f'{engine}/{group}/{marker}'] = dict(line=line, receipt=receipt)

electron = [json.loads(line[line.index('{'):]) for line in raw['electron']
            if '"nativeElectron":true' in line]
assert len(electron) == 1
for name in ['nativeElectron', 'mainFrameCapture', 'protectedPreferences',
             'ephemeralSessionCleared', 'nativeClipboard', 'ownedOriginRequired',
             'foreignNavigationRefused']:
    assert electron[0][name] is True, name
assert electron[0]['liveProvider'] is False
codeql = [json.loads(line[line.index('{'):]) for line in raw['codeql']
          if '"auditedFalsePositives"' in line]
assert codeql == [{'reports': 1, 'auditedFalsePositives': 2}]

for name in ['hosted-criteria-source-audit.json', 'hosted-criteria-source-deltas.diff']:
    path = logs / name
    entries[str(path.relative_to(root))] = path.read_bytes()
for suffix in ['checks-attempt1.json', 'cancelled-deno-job.json',
               'cancelled-deno-check.json', 'cancelled-deno-annotations.json',
               'pipeline-attempt1.log', 'cancelled-job-logs.log']:
    path = logs / f'hosted-{slug}-{suffix}'
    if path.exists():
        entries[str(path.relative_to(root))] = path.read_bytes()
for name in ['hosted-criteria-audit.md', 'hosted-criteria-plan.md',
             'questionnaire-criteria-audit.md', 'question-turn-policy-audit.md',
             'cv-publication-criteria-audit.md',
             'form-provenance-criteria-audit.md']:
    path = root / 'docs/case-studies/issue-56' / name
    entries[str(path.relative_to(root))] = path.read_bytes()
for name in ['audit-hosted-criteria.py', 'collect-hosted-criteria.py', 'evidence_bundle.py']:
    path = root / 'experiments/issue-56' / name
    entries[str(path.relative_to(root))] = path.read_bytes()
metadata = dict(
    sha=sha, workflows=5, jobs=job_receipts, namedTests=test_receipts,
    browserScenarios=browser_receipts, electron=electron[0], codeql=codeql[0],
    auditedCriteria=['QA09', 'QA10', 'QA16', 'QA25', 'QA26', 'HH23', 'VK23', 'VK24', 'VK25', 'VK26', 'VD08', 'VD11', 'VD12', 'VD13', 'VD14', 'VD15'],
    historicalCacheFailureCause='Unwitnessed; original evidence and bounded refusal diagnostics retained',
    liveProvider=False, acceptance=False,
)
entries['metadata.json'] = (json.dumps(metadata, indent=2) + '\n').encode()
write_entries_archive(root / f'docs/case-studies/issue-56/data/hosted-criteria-{slug}.tar.gz', entries)
print(f'Verified {sum(map(len, test_receipts.values()))} named tests, '
      f'{len(browser_receipts)} browser scenarios and native Electron at {sha}')
