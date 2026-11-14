"""Preserve actual desktop availability failures and finite verification."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs, verify_evidence

root, logs, read = evidence_context(__file__, 'desktop-landing')
verify_evidence(read, {
    'before': ['pass 0', 'fail 3'],
    'node': ['pass 36', 'fail 0'],
    'deno': ['31 passed | 0 failed'],
    'browser-before': ['unfinishedUploadLinked', 'true', 'OK (chromium)'],
    'browser': ['cacheRetainsState', 'apiFailureFallback', 'installerDownloads":0', 'OK (chromium)'],
    'format-check': ['All matched files use Prettier code style!'],
})
desktop = json.loads((logs / 'desktop-landing-mcp-desktop.json').read_text())
assert desktop['missing'] == {'href': None, 'disabled': 'true'}
assert desktop['available'] == 13 and not desktop['overflow']
phone = json.loads((logs / 'desktop-landing-mcp-phone.json').read_text())
assert phone['cachedHref'] is None and len(phone['locales']) == 4
assert all(not row['overflow'] and row['href'] is None for row in phone['locales'])
assert json.loads((logs / 'desktop-landing-mcp-server.log').read_text().splitlines()[-1])['resourcesClosed']
live = json.loads((logs / 'desktop-landing-live-audit.json').read_text())
assert len(live['available']) == 14 and live['installerDownloads'] == 0
assert live['releaseCount'] == 76 and live['tag'] == 'v1.2.0'
for runtime in ['node', 'deno']:
    value = (logs / f'cv-publication-alias-{runtime}.log').read_text()
    assert ('pass 1' if runtime == 'node' else '1 passed | 0 failed') in value
sources = changed_sources(root) + evidence_logs(root, 'desktop-landing')
sources += evidence_logs(root, 'cv-publication-alias')
sources += evidence_logs(root, 'cv-publication-exports-parent')
sources += evidence_logs(root, 'cv-publication-parent')
sources += ['js/tests/cv-publication-exports.test.js',
            'experiments/issue-56/cv-publication-alias-path.py',
            'docs/case-studies/issue-56/ci-cv-publication-alias.md']
bundle(root, sources, 'docs/case-studies/issue-56/data/desktop-landing-availability.tar.gz',
       dict(parent='745766488c2c1c6e1773546d9d0a4175a8b28aa0',
            focused_node=36, focused_deno=31, parent_failures=3,
            public_release=live['tag'], public_metadata_releases=76,
            installer_downloads=0, locales=4, issue_complete=False),
       'issue-56-desktop-landing/*.png',
       before={f'js/src/web/download/{name}.js': '74576648'
               for name in ['downloads', 'model', 'page']})
