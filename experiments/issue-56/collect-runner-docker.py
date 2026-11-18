"""Preserve local Docker contract evidence while real hosted execution is pending."""
from pathlib import Path
import json
import subprocess
from evidence_bundle import changed_sources, evidence_logs, verify_evidence, write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
read = lambda name: (logs / f'runner-docker-{name}.log').read_text()
verify_evidence(read, {
    'before': ['tests 2', 'pass 1', 'fail 1', 'Runner profile unavailable or invalid.'],
    'focused': ['tests 52', 'pass 52', 'fail 0', 'cancelled 0', 'skipped 0'],
    'deno': ['8 passed | 0 failed'],
    'bun': ['8 pass', '0 fail'],
    'native': ['"phase":"passed"', '"remoteDockerSaved":true', '"localDockerless":true',
               '"revisionConflictRetainsDraft":true', '"noProcessMutation":true'],
    'format-check': ['All matched files use Prettier code style!'],
    'source-limits': ['0 over the 1500 line limit'],
    'doc-limits': ['All documentation files are within the 2500 line limit.'],
    'zizmor': ['No findings to report.'],
}, empty=('lint-final', 'secrets', 'diff-check', 'shellcheck'))
response = json.loads((logs / 'runner-docker-mcp-result.json').read_text())
receipt = json.loads(response['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert [item['language'] for item in receipt['result']] == ['en', 'ru', 'zh', 'hi']
assert all(item['translated'] and item['profileAcknowledged'] and item['desktopAndPhoneFit']
           for item in receipt['result'])
assert receipt['saves'] == 4 and receipt['pageErrors'] == 0
assert receipt['remoteDockerSaved'] and not receipt['liveProvider']
assert json.loads(read('mcp-server').splitlines()[-1]) == dict(
    resourcesClosed=True, liveProvider=False, mutations=[], healthReads=0)
sources = changed_sources(root)
names = sources + evidence_logs(root, 'runner-docker')
names += ['experiments/issue-56/evidence_bundle.py',
          'experiments/issue-56/application_parent_fixture.py',
          'ci-logs/vk-desktop-reference-README.md',
          'ci-logs/vk-desktop-reference-requirements.source',
          'ci-logs/runner-docker-isolation.js.source',
          'ci-logs/runner-docker-command-builder.js.source',
          'ci-logs/runner-docker-docker-runtime-args.js.source',
          'ci-logs/runner-docker-docker-labels.js.source']
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
parent = '47c2b8081fa89e782bfe76e3eb1543f6736d6baf'
for name in sources:
    if name.startswith('js/src/') and name != 'js/src/server/runner-docker.js':
        entries['before/' + name] = subprocess.check_output(
            ['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(
    parent=parent, desktopReference='8fbf3b7c42fd8e995ef137cab9b9653a7dc9b1a1',
    startReference='3872bd031f5b51902e20bd22b84e9d51a59fcc0b',
    parentTests=2, parentFailures=1, compatibleControls=1,
    nodePasses=52, denoPasses=8, bunPasses=8, nativeBrowser=True,
    independentMcp=True, languages=4, actualSsh=False, actualDocker=False,
    hostedVerificationPending=True, liveProvider=False, acceptedCriteria=86,
    unfinishedCriteria=32, issueComplete=False), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/runner-docker.tar.gz', entries)
