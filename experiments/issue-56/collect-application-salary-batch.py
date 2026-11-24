"""Preserve finite salary-revisit evidence without accepting wider HH parity."""
import json
from evidence_bundle import (
    evidence_context, changed_sources, evidence_logs, verify_evidence,
    bundle, parent_reply_sources,
)

root, logs, read = evidence_context(__file__, 'salary-batch')
verify_evidence(read, {
    'focused-final': ['pass 54', 'fail 0'],
    'before': ['pass 0', 'fail 10'],
    'shared-draft': ['pass 2', 'fail 0'],
    'browser-entry': ['pass 3', 'fail 0'],
    'native': ['[e2e-application-salary-batch] OK (chromium)',
               '"deliveries":2', '"resourcesClosed":true'],
    'mcp-smoke': ['"name":"application-salary","ready":true,"resourcesClosed":true',
                  '"name":"salary-ladder","ready":true,"resourcesClosed":true'],
    'format-check': ['All matched files use Prettier code style!'],
}, empty=('lint', 'secrets', 'diff'))
for phase, deliveries in [('before', 1), ('after', 2)]:
    result = json.loads((logs / f'salary-batch-mcp-{phase}.json').read_text())
    text = next(row['text'] for row in result['content'] if row['type'] == 'text')
    receipt = json.loads(text.split('### Result\n')[1].split('\n###')[0])
    assert receipt['deliveries'] == deliveries
    assert receipt['salaryRevisited'] is (phase == 'after')
    native = receipt['native']
    assert native['closed'] and native['errors'] == receipt['errors'] == []
    assert native['liveProvider'] is False
    assert sum(row['attempts'] for row in native['outcomes']) == deliveries
    assert all(row['entries'] == 0 for row in native['outcomes'])
    server = read(f'mcp-{phase}-server')
    assert json.loads(server.splitlines()[-1]) == {
        'resourcesClosed': True, 'liveProvider': False,
    }
    if phase == 'after':
        assert receipt['locales'] == 4 and receipt['phoneOverflow'] is False
        assert receipt['restartReplayed'] is False
sources = changed_sources(root) + evidence_logs(root, 'salary-batch')
sources += ['ci-logs/application-salary-batch-mcp-runner.js']
bundle(root, sources,
    'docs/case-studies/issue-56/data/application-salary-batch.tar.gz',
    dict(acceptance=False, parent='82ff7202', focusedTests=54,
         additionalSharedFixtureChecks=2, browserRegistrationChecks=3,
         parentPass=0, parentFail=10, nativeDeliveries=2,
         mcpBeforeDeliveries=1, mcpAfterDeliveries=2, locales=4,
         unfinishedCriteria=40, exactSourceHostedVerificationRequired=True),
    'issue-56-application-salary-batch/*.png',
    before=parent_reply_sources(root, sources, '82ff7202'))
