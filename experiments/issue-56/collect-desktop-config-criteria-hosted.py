"""Bind the complete desktop configuration mapping to successful hosted jobs.

This finite reader never runs tests, downloads software or opens a provider.
Archive integrity and green jobs still require review of the pinned clauses.
"""
import json
import hashlib
from pathlib import Path
import re
import subprocess
import sys
from evidence_bundle import write_entries_archive
from hosted_evidence import (
    read_workflows, read_jobs, source_reader, read_catalog_audit,
    read_literal_tests, read_reference_contracts, browser_group_block,
)

root = Path(__file__).resolve().parents[2]
revision, slug = sys.argv[1:]
sha = subprocess.check_output(['git', 'rev-parse', revision], cwd=root).decode().strip()
entries = {}
runs = read_workflows(root, sha, slug, entries)
source = source_reader(root, sha, entries)
registration = json.loads(source('js/scripts/browser-checks.json'))
platforms = {'linux-x64': ('linux', 'x64'), 'linux-arm64': ('linux', 'arm64'),
             'windows-x64': ('win32', 'x64'), 'windows-arm64': ('win32', 'arm64'),
             'macos': ('darwin', 'arm64')}
selection = {f'desktop-{platform}': ('Desktop release', f'Build ({platform})')
             for platform in platforms}
selection['node'] = ('Checks and release', 'Test (node on ubuntu-26.04)')
groups = ['vk-token', 'desktop-appearance', 'vk-engagement', 'vk-friends',
          'vk-configured']
for group in groups:
    shard = registration.index(group) % 4 + 1
    for engine in ['chromium', 'webkit']:
        selection[f'{engine}-{shard}'] = ('Checks and release',
            f'Browser e2e ({engine}, shard {shard}/4)')
raw, jobs = read_jobs(root, runs, slug, selection, entries)

catalog_path = 'experiments/issue-56/desktop-configuration-evidence.json'
catalog = json.loads((root / catalog_path).read_text())
audit = read_catalog_audit(root, sha, 'desktop-configuration-criteria',
                          catalog, source, entries)
review_path = 'ci-logs/desktop-configuration-criteria-source-review.json'
review = json.loads((root / review_path).read_text())
assert review['revision'] == sha and review['acceptance'] is False
for kind in ['audit', 'diff']:
    suffix = 'source-audit.json' if kind == 'audit' else 'source-deltas.diff'
    content = entries[f'ci-logs/desktop-configuration-criteria-{suffix}']
    assert hashlib.sha256(content).hexdigest() == review[f'{kind}Sha256']
pairs = sorted({(path, hashes['archived'], hashes['current'])
    for archive in audit['archives'].values()
    for path, hashes in archive['sources'].items() if hashes['changed']})
assert review['pairs'] == [dict(path=path, archived=old, current=new)
                          for path, old, new in pairs]
assert review['reviewedChangedSourcePairs'] == len(pairs)
assert review['reviewedChangedFiles'] == len({path for path, _, _ in pairs})
entries[review_path] = (root / review_path).read_bytes()
stems = '''startup-configuration desktop-configuration automation-defaults
rolling-cli runner-configuration runner-profile runner-profile-store
runner-profile-api lino-cli-arguments app-directory runner-log diagnostics
redact-log vk-legacy-priorities vk-legacy-catalogs vk-message-defaults
vk-friend-priority vk-configured-policy vk-configured-interfaces
vk-token-acquisition vk-token-api vk-token-authorization vk-token-electron-entry
appearance ui-defaults i18n'''.split()
parameterized = {
    'vk-token-acquisition': {
        'VK ${verdict} validation refusal preserves the previous acknowledged token (${code})': [
            f'VK {verdict} validation refusal preserves the previous acknowledged token ({code})'
            for verdict, code in [('invalid', 'invalid-user-token'),
                                  ('community', 'invalid-user-token'),
                                  ('messages', 'token-account-mismatch')]],
        'VK ${mode} work is single-owner, cancellable and drained at close': [
            f'VK {mode} work is single-owner, cancellable and drained at close'
            for mode in ['window', 'validation']],
    },
    'vk-token-api': {
        'VK token API owns confirmation, cancellation and encrypted acknowledgement (${type})': [
            f'VK token API owns confirmation, cancellation and encrypted acknowledgement ({kind})'
            for kind in ['text/lino', 'application/lino-binary']],
    },
    'vk-token-authorization': {
        'VK Electron ${kind} termination drains its ephemeral session without returning a credential': [
            f'VK Electron {kind} termination drains its ephemeral session without returning a credential'
            for kind in ['foreign', 'parent', 'cancel', 'manual', 'cleanup']],
    },
}
tests = read_literal_tests(stems, source, raw['node'], parameterized=parameterized)
tests.update(read_literal_tests(['secret-store'], source, raw['node'], call='it'))


def json_line(line, marker):
    return json.loads(line[line.index(marker):])


def require_fields(result, expected):
    for key, value in expected.items():
        assert key in result and result[key] == value, (key, result)


native = [(n, json_line(line, '{"nativeElectron"'))
          for n, line in enumerate(raw['desktop-linux-x64'], 1)
          if '{"nativeElectron"' in line]
assert len(native) == 1
native_line, native_result = native[0]
assert native_result == dict(nativeElectron=True, mainFrameCapture=True,
    protectedPreferences=True, ephemeralSessionCleared=True, liveProvider=False,
    nativeClipboard=True, ownedOriginRequired=True, foreignNavigationRefused=True,
    nativeDesktopTls=True, ownedCertificateRequired=True, certificateListenerReleased=True)

packaged = {}
for platform, (os_name, architecture) in platforms.items():
    matches = [(n, json_line(line, '{"packagedDesktop"'))
               for n, line in enumerate(raw[f'desktop-{platform}'], 1)
               if '{"packagedDesktop"' in line]
    assert len(matches) == 1, platform
    number, result = matches[0]
    assert result == dict(packagedDesktop=True, platform=os_name, arch=architecture,
        packaged=True, windows=1, visible=True, contextIsolation=True,
        nodeIntegration=False, backendReady=True, cleanExit=True,
        runtimeDrained=True, liveProvider=False)
    packaged[platform] = dict(line=number, result=result)

browser = {}
for group in groups:
    entry = source(f'js/tests/e2e-{group}-browser.mjs')
    expected = re.findall(r'\bverify\w+\b', entry.split('await runBrowserScenarios', 1)[1])
    assert expected and len(expected) == len(set(expected))
    shard = registration.index(group) % 4 + 1
    for engine in ['chromium', 'webkit']:
        start, end, block = browser_group_block(raw[f'{engine}-{shard}'], group)
        assert any(f'[e2e-{group}] OK ({engine})' in line for line in block)
        passed = [json_line(line, '{"group"') for line in block
                  if '[browser-scenario]' in line and '"phase":"passed"' in line]
        assert [item['scenario'] for item in passed] == expected, (engine, group)
        results = {item['scenario']: item['result'] for item in passed}
        if group == 'vk-token':
            require_fields(results['verifyVkToken'], dict(liveProvider=False,
                confirmedImport=True, reloadReadOnly=True, cancellableValidation=True,
                noMessageCapability=True, boundedReadRecovery=True,
                secretNotInBrowserStorage=True, desktopAndPhoneFit=True))
            assert results['verifyLayeredRunnerProfile'] == dict(
                revisionConflictRetainsDraft=True, explicitReload=True,
                persistedProfile=True, noProcessMutation=True,
                closedEditorDoesNotRead=True, desktopAndPhoneFit=True, liveProvider=False)
        elif group == 'desktop-appearance':
            result = results['verifyDesktopAppearance']
            require_fields(result, dict(detectedLocales=['ru', 'en'],
                explicitLocaleRetained=True, localeReset=True, themeModes=3,
                systemChanges=2, explicitThemeRetained=True, runnerCalls=0,
                pageErrors=0, liveProvider=False))
            assert result['configuredDefaults'] == dict(
                delayedDefaultsPreservedOwnerChoices=True,
                explicitChoicesSurviveReload=True, resetFollowsConfiguredDefaults=True,
                automaticDayNight=True, languages=4, phoneFits=True,
                runnerCalls=0, pageErrors=0, liveProvider=False)
        elif group == 'vk-engagement':
            result = results['verifyVkMessageDefaults']
            require_fields(result, dict(pageErrors=0, providerWrites=0, liveProvider=False))
            assert [item['name'] for item in result['result']] == ['wall', 'birthday']
            for item in result['result']:
                require_fields(item, dict(draftOnly=True, undoOwnerText=True,
                    otherFieldsPreserved=True, refusedSaveRetained=True,
                    savedReloadRetained=True))
            assert results['verifyVkLegacyCatalogs'] == dict(ownerCatalogsReadable=True,
                providerWrites=0, pageErrors=0)
        elif group == 'vk-friends':
            assert results['verifyVkFriendPriority'] == dict(mergedOwnerPriorities=True,
                clearAcknowledged=True, refusedClearRetained=True,
                unsavedOtherFieldRetained=True, reloadRetained=True,
                providerWrites=0, pageErrors=0, liveProvider=False)
            assert results['verifyRunnerLog'] == dict(acknowledgedPreference=True,
                retainedAfterReload=True, downloadedFullSession=True,
                failedSaveRetainsDraft=True, reloadRecoversAcknowledgedPreference=True,
                collapsedOwnerDisposed=True, desktopAndPhoneFit=True,
                pageErrors=0, liveProvider=False)
        else:
            assert results['verifyVkConfigured'] == dict(configuredPercentage=True,
                configuredCapacity=True, reservationsRetained=True,
                failedSaveDraftRetained=True, reloadRetained=True, locales=4,
                syntheticFriendCalls=2, messages=0, pageErrors=0, liveProvider=False)
        browser[f'{engine}/{group}'] = dict(startLine=start, completedLine=end,
                                           scenarios=results)

references = read_reference_contracts(root, {None: [
    'ci-logs/vk-desktop-reference-requirements.json',
    'ci-logs/desktop-reference-bot-config.json',
    'ci-logs/desktop-config-audit-reference-store.json',
    'ci-logs/desktop-config-audit-reference-tests.json',
    'ci-logs/desktop-configuration-reference-friend-prioritization.json',
]}, entries, '8fbf3b7c42fd8e995ef137cab9b9653a7dc9b1a1')
for path in ['js/src/cli/readable-configuration.js', 'js/src/cli/startup-configuration.js',
             'js/src/cli/lino-args.js', 'js/src/configuration/automation-defaults.js',
             'js/src/automation/configured-settings.js', 'js/src/storage/app-directory.js',
             'js/src/storage/secret-store.js', 'js/src/server/redact.js',
             'js/src/server/log-session.js', 'js/src/server/log-settings.js',
             'js/src/sources/vk-token-acquisition.js', 'js/electron/vk-authorization.js',
             'js/tests/helpers/e2e-vk-token.mjs',
             'js/tests/helpers/e2e-runner-profile.mjs',
             'js/tests/helpers/e2e-desktop-appearance.mjs',
             'js/tests/helpers/e2e-ui-defaults.mjs',
             'js/tests/helpers/e2e-vk-message-defaults.mjs',
             'js/tests/helpers/e2e-vk-legacy-catalogs.mjs',
             'js/tests/helpers/e2e-vk-friend-priority.mjs',
             'js/tests/helpers/e2e-runner-log.mjs',
             'js/tests/helpers/e2e-vk-configured.mjs',
             'js/tests/helpers/e2e-browser-scenarios.mjs',
             'experiments/issue-56/vk-token-electron.mjs',
             'experiments/issue-56/desktop-clipboard-electron.mjs',
             'experiments/issue-56/desktop-config-electron.mjs',
             'experiments/issue-56/desktop-packaged-launch.mjs',
             '.github/workflows/release.yml', '.github/workflows/desktop-release.yml']:
    source(path)
for path in [catalog_path, 'experiments/issue-56/collect-desktop-config-criteria-hosted.py',
             'experiments/issue-56/hosted_evidence.py',
             'experiments/issue-56/evidence_bundle.py',
             'docs/case-studies/issue-56/desktop-configuration-criteria-audit.md']:
    entries[path] = (root / path).read_bytes()
entries['metadata.json'] = (json.dumps(dict(sha=sha, criteria=['VD07'], workflows=5,
    jobs=jobs, namedTests=tests, nativeElectron=dict(line=native_line, result=native_result),
    packagedReceipts=packaged, browserReceipts=browser, referenceContracts=references,
    archiveEntries=sum(item['entries'] for item in audit['archives'].values()),
    acceptance=False, fullIssueComplete=False), indent=2) + '\n').encode()
write_entries_archive(root /
    f'docs/case-studies/issue-56/data/desktop-configuration-hosted-{slug}.tar.gz', entries)
