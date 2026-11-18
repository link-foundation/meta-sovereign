"""Preserve configured capacity evidence without accepting the wider VD07 row."""
import json
import subprocess
from evidence_bundle import changed_sources, evidence_context, evidence_logs, write_entries_archive

root, logs, read = evidence_context(__file__, 'vk-configured')
for name, fragments in {
    'focused-final': ['ℹ tests 15', 'ℹ pass 15', 'ℹ fail 0'],
    'focused': ['ℹ tests 43', 'ℹ pass 43', 'ℹ fail 0'],
    'parent': ['ℹ tests 11', 'ℹ pass 1', 'ℹ fail 10'],
    'format-check': ['All matched files use Prettier code style!'],
    'source-limits': ['0 over the 1500 line limit'],
    'doc-limits': ['All documentation files are within'],
}.items():
    assert all(fragment in read(name) for fragment in fragments), name
for name in ['lint-final', 'secrets', 'whitespace']:
    assert not read(name).strip(), name
native = json.loads(read('native-after').splitlines()[-1])
assert native == dict(configuredPercentage=True, configuredCapacity=True,
                      reservationsRetained=True, failedSaveDraftRetained=True,
                      reloadRetained=True, locales=4, syntheticFriendCalls=2,
                      messages=0, pageErrors=0, liveProvider=False)
inspection = json.loads((logs / 'vk-configured-mcp-result.json').read_text())
receipt = json.loads(inspection['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert receipt['errors'] == [] and receipt['liveProvider'] is False
assert [item['language'] for item in receipt['result']] == ['en', 'ru', 'hi', 'zh']
assert all(item == dict(language=item['language'], translated=True,
                        savedChoiceRetained=True, fractionalPercentage=True,
                        refusedDraftRetained=True, syntheticFriendCalls=0, messages=0)
           for item in receipt['result'])
server = json.loads(read('mcp-server').splitlines()[-1])
assert server['resourcesClosed'] and not server['liveProvider']
assert server['syntheticFriendCalls'] == server['messages'] == 0
assert server['settings']['topPercentMutuals'] == 12.5
names = set(changed_sources(root)) | set(evidence_logs(root, 'vk-configured'))
names.update('ci-logs/' + name for name in [
    'vk-configured-mcp-code.js',
    'desktop-configuration-reference-friend-prioritization.json',
    'desktop-configuration-reference-friend-prioritization.js',
    'bot-configuration-reference-config.js',
])
names.update({
    'experiments/issue-56/previous-module.mjs',
    'experiments/issue-56/evidence_bundle.py',
    'experiments/issue-56/vk-desktop-fixture.mjs',
    'experiments/issue-56/vk-friends-fixture.mjs',
})
entries = {name: (root / name).read_bytes() for name in sorted(names)}
for file in ['vk-friends-settings.js', 'vk-friend-quota.js',
             'vk-friends-planner.js', 'vk-friends-executor.js']:
    name = 'js/src/automation/' + file
    entries['before/' + name] = subprocess.check_output(
        ['git', 'show', f'132c16f69ea61e22cd7d9e2c3fbcead90a329686:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(
    accepted=False, verified=88, unfinished=30, criterion='VD07 remains unfinished',
    parent='132c16f69ea61e22cd7d9e2c3fbcead90a329686',
    reference='8fbf3b7c42fd8e995ef137cab9b9653a7dc9b1a1',
    limitation='Hosted full matrices remain required; one unexplained MCP cache warning.'
), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/vk-configured.tar.gz', entries)
