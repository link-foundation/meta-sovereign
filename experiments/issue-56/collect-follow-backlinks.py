"""Preserve the unresolved hosted Backlinks disclosure and recurrence traces."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'follow-backlinks')
assert 'pass 3' in read('contracts')
assert not read('lint').strip()
assert 'All matched files use Prettier code style!' in read('static')
assert not read('secrets').strip()
assert 'ERROR' not in read('duplication')
for file, panel in [('trace-webkit', 'backlinks'), ('chats-compatibility', 'chats')]:
    text = read(file)
    assert f'[e2e-follow-{panel}] OK (webkit)' in text
    snapshots = [json.loads(line.split(' ', 1)[1]) for line in text.splitlines()
                 if line.startswith('[follow-disclosure] ')]
    assert all(row['panel'] == panel for row in snapshots)
    assert any(row.get('open') and any(event['trusted'] and event['type'] == 'toggle'
               for event in row.get('events', [])) for row in snapshots)
base = 'b3f258489b86dfb6af72b503ae00ec7f6cc3b4d6'
sources = changed_sources(root, base) + evidence_logs(root, 'follow-backlinks')
sources += ['ci-logs/cv-watch-parent-checks.json',
            'ci-logs/cv-watch-parent-webkit2-131069572747.log']
bundle(root, sources, 'docs/case-studies/issue-56/data/ci-follow-backlinks.tar.gz',
       dict(published_base=base, workflow_contracts=3, native_webkit_workflows=2,
            hosted_failure=dict(commit='15f9c3e898805c91ca6f54a142fb279f89d598e2',
                                run=43183721390, job=131069572747,
                                lines=[1521, 1540]),
            unfinished='Hosted Follow disclosure cause, exact-head CI and all unchecked product requirements'),
       'issue-56-follow-backlinks/*.png',
       before={name: base for name in [
           'js/tests/e2e-follow-backlinks-browser.mjs',
           'js/tests/helpers/e2e-follow-disclosure-trace.mjs']})
