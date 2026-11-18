"""Bind execution and shared desktop UI contracts to actual hosted completion.

This reads preserved logs and sources only. Successful archive integrity is not
acceptance: the pinned clauses and actual awaited assertions need human review.
"""
import json
from pathlib import Path
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
selection.update(node=('Checks and release', 'Test (node on ubuntu-26.04)'),
                 **{'native-linux': ('Checks and release',
                    'Native helpers and containers (ubuntu-26.04)')})
groups = ['vk-token', 'desktop-appearance']
for group in groups:
    shard = registration.index(group) % 4 + 1
    for engine in ['chromium', 'webkit']:
        selection[f'{engine}-{shard}'] = ('Checks and release',
            f'Browser e2e ({engine}, shard {shard}/4)')
raw, jobs = read_jobs(root, runs, slug, selection, entries)

catalog_path = 'experiments/issue-56/desktop-runner-evidence.json'
catalog = json.loads((root / catalog_path).read_text())
audit = read_catalog_audit(root, sha, 'desktop-runner-criteria', catalog, source, entries)
stems = [Path(path).name.removesuffix('.test.js') for path in
         subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', sha,
                                  'js/tests'], cwd=root).decode().splitlines()
         if Path(path).name.startswith('runner-') and path.endswith('.test.js')]
stems += ['desktop-lifecycle', 'desktop-configuration',
          'appearance', 'ui-defaults', 'i18n']
parameterized = {'runner-exclusive-receipt': {
    '${mode} Start refuses a ${changed} other mode observed after launch': [
        f'{mode} Start refuses a {changed} other mode observed after launch'
        for mode in ['local', 'server'] for changed in ['running', 'unknown']],
    '${mode} Start rechecks exclusion before accepting an already running target': [
        f'{mode} Start rechecks exclusion before accepting an already running target'
        for mode in ['local', 'server']],
}}
tests = read_literal_tests(stems, source, raw['node'], parameterized=parameterized)
tests.update(read_literal_tests(['desktop-window'], source, raw['node'], call='it'))


def json_line(line, marker):
    return json.loads(line[line.index(marker):])


native = {}
for number, line in enumerate(raw['native-linux'], 1):
    if '{"actualSsh"' not in line:
        continue
    receipt = json_line(line, '{"actualSsh"')
    isolation = receipt['serverIsolation']
    assert isolation in ['screen', 'docker'] and isolation not in native
    assert receipt == dict(actualSsh=True, actualDocker=isolation == 'docker',
        serverIsolation=isolation, actualApplication=True, health='ready',
        explicitStarts=2, noImplicitLaunch=True, privateDataRetained=True,
        foreignContainerRefused=isolation == 'docker', mutuallyExclusiveModes=True,
        liveProvider=False)
    assert json_line(raw['native-linux'][number], '{"applicationResourcesClosed"') == {
        'applicationResourcesClosed': True}
    native[isolation] = dict(line=number, result=receipt, cleanupLine=number + 1)
assert set(native) == {'screen', 'docker'}

packaged = {}
for platform, (os_name, architecture) in platforms.items():
    matches = [(n, json_line(line, '{"packagedDesktop"'))
               for n, line in enumerate(raw[f'desktop-{platform}'], 1)
               if '{"packagedDesktop"' in line]
    assert len(matches) == 1, platform
    number, receipt = matches[0]
    assert receipt == dict(packagedDesktop=True, platform=os_name, arch=architecture,
        packaged=True, windows=1, visible=True, contextIsolation=True,
        nodeIntegration=False, backendReady=True, cleanExit=True,
        runtimeDrained=True, liveProvider=False)
    packaged[platform] = dict(line=number, result=receipt)

browser = {}
for group in groups:
    shard = registration.index(group) % 4 + 1
    for engine in ['chromium', 'webkit']:
        start, end, block = browser_group_block(raw[f'{engine}-{shard}'], group)
        assert any(f'[e2e-{group}] OK ({engine})' in line for line in block)
        passed = [json_line(line, '{"group"') for line in block
                  if '[browser-scenario]' in line and '"phase":"passed"' in line]
        expected = (['verifyDesktopAppearance'] if group == 'desktop-appearance' else
            ['verifyVkToken', 'verifyRunnerSessions', 'verifyRunnerProfile',
             'verifyLayeredRunnerProfile', 'verifyDockerRunnerProfile',
             'verifyRunnerHealth', 'verifyRunnerFeedback'])
        assert [value['scenario'] for value in passed] == expected
        results = {value['scenario']: value['result'] for value in passed}
        assert all(result['liveProvider'] is False for result in results.values())
        if group == 'desktop-appearance':
            result = results['verifyDesktopAppearance']
            assert result == dict(detectedLocales=['ru', 'en'],
                explicitLocaleRetained=True, localeReset=True, themeModes=3,
                systemChanges=2, explicitThemeRetained=True, runnerCalls=0,
                pageErrors=0, liveProvider=False, configuredDefaults=dict(
                    delayedDefaultsPreservedOwnerChoices=True,
                    explicitChoicesSurviveReload=True, resetFollowsConfiguredDefaults=True,
                    automaticDayNight=True, languages=4, phoneFits=True,
                    runnerCalls=0, pageErrors=0, liveProvider=False))
        else:
            result = results['verifyRunnerSessions']
            assert result == dict(stoppedDefaults=True, bothSwitchDirections=True,
                unknownStateBlocksSwitch=True, ambiguousActionNotReplayed=True,
                collapsedDoesNotProbe=True, desktopAndPhoneFit=True, liveProvider=False)
        browser[f'{engine}/{group}'] = dict(startLine=start, completedLine=end,
                                           scenarios=results, liveProvider=False)

for path in ['js/src/server/runner-control.js', 'js/src/server/runner-controller.js',
             'js/src/server/runner-session.js', 'js/src/server/runner-screen.js',
             'js/src/server/runner-docker.js', 'js/src/server/runner-transport.js',
             'js/src/server/routes-runner.js', 'js/src/cli/runner-command.js',
             'js/src/cli/runner-profile.js', 'js/src/web/settings-runner.js',
             'js/src/web/runner-view-state.js', 'js/electron/main.js',
             'js/electron/lifecycle.js', 'js/electron/window.js',
             'js/tests/e2e-vk-token-browser.mjs',
             'js/tests/e2e-desktop-appearance-browser.mjs',
             'js/tests/helpers/e2e-browser-scenarios.mjs',
             'js/tests/helpers/e2e-runner-sessions.mjs',
             'js/tests/helpers/e2e-desktop-appearance.mjs',
             'js/tests/helpers/e2e-ui-defaults.mjs',
             'experiments/issue-56/runner-docker-hosted.mjs',
             'experiments/issue-56/runner-docker-hosted.sh',
             'experiments/issue-56/desktop-packaged-launch.mjs',
             '.github/workflows/release.yml', '.github/workflows/desktop-release.yml']:
    source(path)
references = read_reference_contracts(root,
    {None: ['ci-logs/vk-desktop-reference-requirements.json']}, entries,
    '8fbf3b7c42fd8e995ef137cab9b9653a7dc9b1a1')
for name in [catalog_path, 'experiments/issue-56/collect-desktop-runner-hosted.py',
             'experiments/issue-56/hosted_evidence.py',
             'experiments/issue-56/evidence_bundle.py',
             'docs/case-studies/issue-56/desktop-runner-criteria-audit.md']:
    entries[name] = (root / name).read_bytes()
entries['metadata.json'] = (json.dumps(dict(sha=sha, criteria=['VD02', 'VD06'],
    workflows=5, jobs=jobs, namedTests=tests, remoteReceipts=native,
    packagedReceipts=packaged, browserReceipts=browser, referenceContracts=references,
    archiveEntries=sum(item['entries'] for item in audit['archives'].values()),
    automaticDependencyPreparation=False, acceptance=False, fullIssueComplete=False),
    indent=2) + '\n').encode()
write_entries_archive(root /
    f'docs/case-studies/issue-56/data/desktop-runner-hosted-{slug}.tar.gz', entries)
