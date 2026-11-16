"""Bind criterion evidence to successful exact-source hosted jobs.

Run after preserving all five workflow responses and the eleven named raw job
logs. This does not run a local matrix or complete an inventory criterion.
The original behavior mapping and source differences still require review.
"""
import ast
import base64
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import tarfile
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
    'question-language', 'question-language-controls',
    'question-summary', 'question-summary-controls',
    'question-final-period', 'question-final-period-controls',
    'migrations-answer-final-period', 'question-answer-equivalents',
    'question-equivalents-controls', 'migrations-answer-equivalents',
    'question-availability', 'question-period-workers', 'question-period-scope',
    'forms-period', 'forms-auto-prefill', 'forms-automatic-controls',
    'forms-review-prefill',
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
    if stem == 'forms-auto-prefill':
        templates = re.findall(r'\btest\(\s*`([^`]+\$\{media\}[^`]*)`\s*,',
                               content.decode())
        assert len(templates) == 1, path
        names.extend(templates[0].replace('${media}', kind) for kind in
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
    'verifyQuestionLanguage': 'e2e-question-language',
    'verifyQuestionSummary': 'e2e-question-summary',
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
wording_helpers = {
    'verifyQuestionFinalPeriod': 'e2e-question-final-period',
    'verifyQuestionEquivalents': 'e2e-question-equivalents',
    'verifyQuestionAvailability': 'e2e-question-availability',
}
assert 'await verifyAnswerWording(preview);' in question_source.decode()
assert 'await withIsolatedAnswerRules(verify);' in question_source.decode()
for name, helper in wording_helpers.items():
    assert f'() => {name}(' in question_source.decode(), name
    path = f'js/tests/helpers/{helper}.mjs'
    entries[path] = subprocess.check_output(
        ['git', 'show', f'{sha}:{path}'], cwd=root)
worker_entry = 'js/tests/e2e-question-controls-browser.mjs'
entries[worker_entry] = subprocess.check_output(
    ['git', 'show', f'{sha}:{worker_entry}'], cwd=root)
assert '        verifyQuestionPeriodWorkers,' in entries[worker_entry].decode()
for path in ['js/tests/helpers/e2e-question-period-workers.mjs',
             'js/tests/helpers/e2e-form-automatic.mjs',
             'js/scripts/browser-checks.json', 'js/scripts/run-browser-checks.mjs']:
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
    wording = {
        'question-final-period': dict(observations=5, defaultWith=True,
                                     configuredWithout=True, rawPreserved=True,
                                     refusalPreserved=True, mobileFits=True),
        'question-equivalents': dict(observations=5, rawPreserved=True, saved=True,
                                    refusalPreserved=True, reload=True,
                                    mobileFits=True),
        'question-availability': dict(timing=True, unrelatedQuestionLiteral=True,
                                     observations=1, reload=True,
                                     rawPreserved=True, mobileFits=True),
        'question-wording-sequence': dict(scenarios=3, rulesRestored=True),
        'question-period-workers': dict(overrideRetained=True, draft='Vietnam',
                                       sends=0, observations=5),
        'forms-period': dict(answer='English', count=5, recovered=True,
                             changedPreference='form-prefill-conflict',
                             submissionAttempted=False),
    }
    for marker, expected in wording.items():
        matches = [(tag, i, json.loads(line.split(f'[{marker}] ', 1)[1]))
                   for tag, lines in raw.items() if tag.startswith(f'{engine}-')
                   for i, line in enumerate(lines, 1) if f'[{marker}] ' in line]
        assert len(matches) == 1, (engine, marker)
        tag, line, receipt = matches[0]
        assert receipt == expected, (tag, marker, receipt)
        group = ('forms-reader' if marker == 'forms-period' else
                 'question-controls' if marker == 'question-period-workers' else
                 'questions')
        assert any(f'[e2e-{group}] OK ({engine})' in value for value in raw[tag]), group
        browser_receipts[f'{engine}/{group}/{marker}'] = dict(
            job=tag, line=line, receipt=receipt)
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
        ('forms-reader', 1, 'forms-questionnaire-learning'),
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

for name in ['hosted-criteria-source-audit.json', 'hosted-criteria-source-deltas.diff',
             '55292-source-audit.log', '55292-wording-source-deltas.diff',
             '55292-shared-integration-delta.diff']:
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
             'form-provenance-criteria-audit.md',
             'question-recognition-summary-audit.md',
             'question-wording-criteria-audit.md']:
    path = root / 'docs/case-studies/issue-56' / name
    entries[str(path.relative_to(root))] = path.read_bytes()
for name in ['audit-hosted-criteria.py', 'collect-hosted-criteria.py', 'evidence_bundle.py']:
    path = root / 'experiments/issue-56' / name
    entries[str(path.relative_to(root))] = path.read_bytes()
reference_receipts = {}
with tarfile.open(root / 'docs/case-studies/issue-56/data/question-summary.tar.gz') as archive:
    for stem in ['corrections', 'requirements']:
        name = f'ci-logs/question-summary-reference-{stem}.json'
        response = archive.extractfile(name).read()
        reference = json.loads(response)
        content = base64.b64decode(reference['content'])
        blob = b'blob ' + str(len(content)).encode() + b'\0' + content
        assert hashlib.sha1(blob).hexdigest() == reference['sha'], name
        assert 'fa0991b8c2d0896fb3b4be6c69947f0590094b15' in reference['html_url'], name
        entries[f'references/{stem}.json'] = response
        entries[f'references/{reference["path"]}'] = content
        reference_receipts[stem] = dict(url=reference['html_url'],
                                        blob=reference['sha'])
with tarfile.open(root / 'docs/case-studies/issue-56/data/question-final-period.tar.gz') as archive:
    for stem in ['answer-preferences.test.mjs', 'answer-variants.test.mjs']:
        name = f'ci-logs/final-period-{stem}.json'
        response = archive.extractfile(name).read()
        reference = json.loads(response)
        content = base64.b64decode(reference['content'])
        blob = b'blob ' + str(len(content)).encode() + b'\0' + content
        assert hashlib.sha1(blob).hexdigest() == reference['sha'], name
        assert 'fa0991b8c2d0896fb3b4be6c69947f0590094b15' in reference['html_url'], name
        entries[f'references/{stem}.json'] = response
        entries[f'references/{reference["path"]}'] = content
        reference_receipts[stem] = dict(url=reference['html_url'],
                                        blob=reference['sha'])
metadata = dict(
    sha=sha, workflows=5, jobs=job_receipts, namedTests=test_receipts,
    browserScenarios=browser_receipts, electron=electron[0], codeql=codeql[0],
    referenceContracts=reference_receipts,
    auditedCriteria=['QA01', 'QA07', 'QA08', 'QA09', 'QA10', 'QA11', 'QA16', 'QA25', 'QA26', 'HH23', 'VK23', 'VK24', 'VK25', 'VK26', 'VD08', 'VD11', 'VD12', 'VD13', 'VD14', 'VD15'],
    historicalCacheFailureCause='Unwitnessed; original evidence and bounded refusal diagnostics retained',
    liveProvider=False, acceptance=False,
)
entries['metadata.json'] = (json.dumps(metadata, indent=2) + '\n').encode()
write_entries_archive(root / f'docs/case-studies/issue-56/data/hosted-criteria-{slug}.tar.gz', entries)
print(f'Verified {sum(map(len, test_receipts.values()))} named tests, '
      f'{len(browser_receipts)} browser scenarios and native Electron at {sha}')
