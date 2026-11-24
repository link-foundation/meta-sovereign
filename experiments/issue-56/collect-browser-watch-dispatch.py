"""Preserve actual watched-adapter cancellation failures and focused checks."""
import subprocess
from evidence_bundle import (evidence_context, changed_sources, evidence_logs,
                             verify_evidence, bundle)

root, logs, read = evidence_context(__file__, 'browser-watch-dispatch')
parent = subprocess.check_output(['git', 'rev-parse', 'f0b3ea33'], cwd=root).decode().strip()
assert 'pass 2' in read('before') and 'fail 6' in read('before')
assert read('before').count('Missing expected rejection.') == 6
verify_evidence(read, {'node': ['pass 30', 'fail 0'],
                       'deno': ['30 passed | 0 failed'],
                       'check': ['All matched files use Prettier code style!']})
sources = changed_sources(root, parent) + evidence_logs(root, 'browser-watch-dispatch')
sources += ['js/src/sources/browser-choice-document.js',
            'js/src/sources/browser-text-reply.js',
            'experiments/issue-56/question-watch-fixture.mjs']
bundle(root, sources, 'docs/case-studies/issue-56/data/browser-watch-dispatch.tar.gz',
       {'parent': parent, 'focusedNode': 30, 'focusedDeno': 30,
        'newAdapterCases': 8, 'liveProvider': False,
        'hostedAcceptance': 'pending', 'acceptedInventoryRows': [],
        'remainingRows': 60}, 'issue-56-watch-dispatch-no-screenshots-*', before={
            name: parent for name in ['js/src/sources/browser-answer-watch.js',
                                     'js/src/sources/browser-choices.js']})
