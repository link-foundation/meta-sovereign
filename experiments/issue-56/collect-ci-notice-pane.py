"""Retain the actual hosted and finite native pane-refusal mismatch."""
import json
import subprocess
from evidence_bundle import (evidence_context, changed_sources, evidence_logs,
                             verify_evidence, bundle)

root, logs, read = evidence_context(__file__, 'ci-notice-pane')
parent = subprocess.check_output(['git', 'rev-parse', 'b88a4c98'], cwd=root).decode().strip()
before = read('before')
assert "+ 'answer-chat-unverified'" in before
assert "- 'answer-text-changed'" in before
verify_evidence(read, {'native': ['PASS employer-changed-before-dispatch',
                                 '"cases":1,"liveProvider":false'],
                       'contract': ['pass 1', 'fail 0'],
                       'check': ['All matched files use Prettier code style!']})
hosted = (logs / 'checks-43806850080-chromium-4.log').read_text()
assert 'e2e-notice-policy.mjs:205' in hosted
assert "'answer-chat-unverified'" in hosted and "'answer-text-changed'" in hosted
metadata = json.loads((logs / 'ci-notice-pane-run.json').read_text())
assert metadata['headSha'] == 'dc876f723c8b95c961e266e5b39ebbc2ff23bad7'
assert any(job['databaseId'] == 133100713162 and job['conclusion'] == 'failure'
           for job in metadata['jobs'])
sources = changed_sources(root, parent) + evidence_logs(root, 'ci-notice-pane')
sources += ['ci-logs/checks-43806850080-chromium-4.log',
            'js/src/sources/browser-pane-identity.js',
            'js/src/sources/browser-history-capture.js',
            'js/src/sources/browser-history-observer.js',
            'js/src/sources/browser-answer-watch.js',
            'js/tests/e2e-question-notice-policy-browser.mjs']
bundle(root, sources, 'docs/case-studies/issue-56/data/ci-notice-pane.tar.gz',
       {'parent': parent, 'hostedRun': 43806850080,
        'failedJob': 133100713162, 'nativeCases': 1, 'contracts': 1,
        'productionChanged': False, 'liveProvider': False,
        'hostedAcceptance': 'pending', 'acceptedInventoryRows': [],
        'remainingRows': 60}, 'issue-56-ci-notice-pane-no-screenshots-*', before={
            'js/tests/helpers/e2e-notice-policy.mjs': parent})
