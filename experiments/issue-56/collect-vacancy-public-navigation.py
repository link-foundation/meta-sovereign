"""Preserve the finite anonymous read and the incorrectly configured control."""
import json
from evidence_bundle import evidence_context, write_entries_archive

root, logs, read = evidence_context(__file__, 'vacancy-public-navigation')
lines = read('wrapper').splitlines()
navigation = json.loads(lines[-2])
receipt = json.loads(lines[-1])
assert navigation['navigated'] and navigation['verified']
assert navigation['status'] == 'ready'
assert navigation['readiness']['checks']['skipped'] == ['networkIdleFor']
for name in ('anonymous', 'liveProvider', 'allClosed', 'fullDomTextEqual',
             'exactPrivateHtmlEqual', 'canonicalAliasReused', 'reopenedStoreEqual', 'cliEqual'):
    assert receipt[name] is True, name
assert receipt['opened'] == 1 and receipt['clicks'] == 0
assert receipt['descriptionCharacters'] == 3035
assert receipt['descriptionHtmlCharacters'] == 4393
assert receipt['pageErrors'] == [] and receipt['issueComplete'] is False
control = json.loads(read('default').splitlines()[1])
assert control['status'] == 'timed_out'
assert control['readiness']['checks']['failed'] == ['networkIdleFor']
for name in ('lint', 'diff'):
    assert not read(name).strip(), name
names = {
    'experiments/issue-56/collect-vacancy-public-navigation.py',
    'experiments/issue-56/evidence_bundle.py',
    'experiments/issue-56/vacancy-public-mcp.mjs',
    'experiments/issue-56/vacancy-public-browser.mjs',
    'experiments/issue-56/question-browser-probe.mjs',
    'js/src/cv/browser.js', 'js/src/assignments/read-page.js',
    'js/src/assignments/vacancy-reader.js', 'js/src/assignments/vacancy.js',
    'docs/case-studies/issue-56/vacancy-modern.md',
    'docs/screenshots/issue-56-vacancy-modern/public-native.png',
    'node_modules/browser-commander/src/factory.js',
    'node_modules/browser-commander/src/browser/navigation.js',
}
names.update(str(path.relative_to(root)) for path in logs.glob('vacancy-public-*')
             if path.is_file() and path.suffix in ('.log', '.mjs', '.js', '.png'))
entries = {name: (root / name).read_bytes() for name in sorted(names)}
entries['metadata.json'] = (json.dumps({
    'parent': 'b4cf60bbf560d82fe7ff74f558d82187843f073d',
    'navigation': navigation, 'receipt': receipt,
    'alteredLibraryDefaultControl': control,
    'productionNavigationChanged': False,
    'originalRefusalRootCauseEstablished': False,
    'authenticatedProviderVerified': False,
    'acceptedInventoryRows': [], 'issueComplete': False,
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/vacancy-public-navigation.tar.gz', entries)
