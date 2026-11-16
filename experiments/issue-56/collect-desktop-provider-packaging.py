"""Retain the desktop provider omission and focused closure checks."""
from evidence_bundle import (evidence_context, changed_sources, evidence_logs,
                             verify_evidence, bundle)

root, logs, read = evidence_context(__file__, 'desktop-provider-packaging')
assert 'pass 17' in read('before') and 'fail 6' in read('before')
verify_evidence(read, {'node': ['pass 23', 'fail 0'],
                       'deno': ['23 passed | 0 failed'],
                       'imports': ['"available":true', '"telegram":true',
                                   '"browserLaunches":0', '"accountConnections":0'],
                       'check': ['All matched files use Prettier code style!']})
parent = 'dc876f723c8b95c961e266e5b39ebbc2ff23bad7'
sources = changed_sources(root, parent) + evidence_logs(root, 'desktop-provider-packaging')
sources += ['ci-logs/desktop-provider-packaging-reference-package.json',
            'js/src/cv/browser.js', 'js/src/sources/telegram-layer.js',
            'js/src/sources/telegram-session-loader.js',
            '.github/workflows/desktop-release.yml', 'package.json']
bundle(root, sources, 'docs/case-studies/issue-56/data/desktop-provider-packaging.tar.gz',
       {'parent': parent, 'focusedNode': 23, 'focusedDeno': 23,
        'cleanStagedInstall': 'pending hosted verification',
        'liveProvider': False, 'acceptedInventoryRows': [], 'remainingRows': 60},
       'issue-56-desktop-provider-no-screenshots-*', before={
           name: parent for name in ['js/scripts/prepare-desktop.mjs',
                                    'js/scripts/validate-desktop-runtime.mjs']})
