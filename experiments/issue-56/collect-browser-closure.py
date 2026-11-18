"""Preserve confirmed close boundaries and the unexplained hosted timing failure."""
import json
import subprocess
from evidence_bundle import changed_sources, evidence_context, evidence_logs, write_entries_archive

root, logs, read = evidence_context(__file__, 'browser-closure')
assert all(fragment in read('focused-final') for fragment in
           ['ℹ tests 26', 'ℹ pass 26', 'ℹ fail 0'])
assert 'All matched files use Prettier code style!' in read('format-check')
assert all(not read(name).strip() for name in ['lint-final', 'secrets', 'whitespace'])
for name, fragments in {
    'persistent-close-parent-final.log': ['ℹ tests 7', 'ℹ pass 5', 'ℹ fail 2'],
    'deferred-close-parent-final.log': ['ℹ tests 3', 'ℹ pass 2', 'ℹ fail 1'],
    'persistent-close-native-parent.log': ['"exitedAtReturn":false'],
    'persistent-close-native-current.log': ['"reattached":true,"exitedAtReturn":true'],
    'b980-deferred-webkit-isolated.log': ['"phase":"passed"', '"submissions":0'],
}.items():
    assert all(fragment in (logs / name).read_text() for fragment in fragments), name
server = json.loads(read('mcp-server').splitlines()[-1])
assert server == dict(resourcesClosed=True, browserOpens=0, liveProvider=False)
inspection = json.loads((logs / 'browser-closure-mcp-result.json').read_text())
receipt = json.loads(inspection['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert receipt == dict(independentMcp=True, savedAfterReload=True,
                       widths=[1180, 390], entries=1, browserOpens=0, liveProvider=False)
names = set(changed_sources(root)) | set(evidence_logs(root, 'browser-closure'))
names.update(str(file.relative_to(root)) for file in logs.glob('b980-webkit-2-artifacts/*'))
names.update('ci-logs/' + name for name in [
    'persistent-close-parent-final.log', 'deferred-close-parent-final.log',
    'persistent-close-native-parent.log', 'persistent-close-native-current.log',
    'b980-deferred-webkit-isolated.log', 'b980-webkit-2-134820577849.log',
    'pre-push-b980-jobs.json',
])
names.update({
    'experiments/issue-56/previous-module.mjs',
    'experiments/issue-56/evidence_bundle.py',
})
entries = {name: (root / name).read_bytes() for name in sorted(names)}
for file in ['js/src/cv/persistent-browser.js',
             'js/tests/helpers/e2e-deferred-questions.mjs']:
    entries[f'before/{file}'] = subprocess.check_output(
        ['git', 'show', f'3ca58536df184607163e2fba848958fa127b7555:{file}'], cwd=root)
sdk = root / 'node_modules/browser-commander'
assert json.loads((sdk / 'package.json').read_text())['version'] == '0.34.1'
for file in ['package.json', 'src/browser/persistent-session.js']:
    entries[f'installed-sdk/browser-commander/{file}'] = (sdk / file).read_bytes()
write_entries_archive(root / 'docs/case-studies/issue-56/data/browser-closure.tar.gz', entries)
