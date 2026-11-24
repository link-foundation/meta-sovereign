"""Retain bounded source, real local Git, browser and wire evidence."""
import json
import subprocess
from evidence_bundle import changed_sources, evidence_context, evidence_logs, verify_evidence, write_entries_archive

root, logs, read = evidence_context(__file__, 'experience-publication')
verify_evidence(read, {
    'node-before': ['jobs-cv-publication-unverified', 'fail 1'],
    'node-final': ['pass 28', 'fail 0'],
    'browser-before': ['"experiencePublication":false', '"providerSessions":0'],
    'browser-final': ['"experiencePublication":true', '"privateOriginalsPreserved":2',
                      '"localPushes":1', '"recoveryReplayed":false', '"locales":4'],
}, empty=('lint-final', 'diff'))
network = read('mcp-network')
assert network.count('[POST]') == 2
assert network.count('/cv-publish-plan => [200]') == 1
assert network.count('/cv-publish => [200]') == 1
closed = json.loads(read('mcp-server').splitlines()[-1])
assert closed['resourcesClosed'] and closed['privateOriginalsPreserved']
assert closed['pushes'] == 1 and closed['realProvider'] is False
names = [*changed_sources(root), *[name for name in evidence_logs(root, 'experience-publication')
    if '-draft' not in name and '-pr-before' not in name]]
entries = {name: (root / name).read_bytes() for name in names}
for name in ['js/src/jobs/cv-publication-source.js', 'js/src/jobs/cv-publication-record.js',
             'js/src/web/cv-experience-documents.js']:
    entries[f'before/{name}'] = subprocess.check_output([
        'git', 'show', f'b868a82b:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps({
    'implementationParent': 'b868a82b4a2c26f1f285965037aedd43467babd9',
    'newPortableChecks': 6, 'focusedPass': 28, 'nativeBrowserScenarios': 1,
    'mcpPlanPosts': 1, 'mcpPublishPosts': 1, 'realProvider': False,
    'originalAccepted': 58, 'originalUnchecked': 60, 'issueComplete': False,
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/experience-publication.tar.gz', entries)
