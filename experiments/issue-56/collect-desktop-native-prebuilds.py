"""Preserve exact hosted native-binary failures and the finite correction."""
import json
import subprocess
from evidence_bundle import (evidence_context, changed_sources, evidence_logs,
                             verify_evidence, bundle)

root, logs, read = evidence_context(__file__, 'desktop-native-prebuilds')
parent = subprocess.check_output(['git', 'rev-parse', 'fc968e1a'], cwd=root).decode().strip()
assert 'pass 0' in read('before') and 'fail 7' in read('before')
assert 'Mach-O arm64, expected ELF x64' in read('before')
verify_evidence(read, {'node': ['pass 26', 'fail 0'],
                       'deno': ['26 passed | 0 failed'],
                       'check': ['All matched files use Prettier code style!']})
run = json.loads((logs / 'desktop-43811953283.json').read_text())
assert run['headSha'] == '83fea0ee2698272cead2226d7c4445c596f5a31d'
assert sum(job['conclusion'] == 'failure' for job in run['jobs']) == 5
assert 'darwin-arm64.node: Mach-O arm64, expected ELF x64' in (
    logs / 'desktop-43811953283.log').read_text()
sources = changed_sources(root, parent) + evidence_logs(root, 'desktop-native-prebuilds')
sources += ['ci-logs/desktop-43811953283.json', 'ci-logs/desktop-43811953283.log',
            'js/tests/desktop-packaging.test.js',
            'js/scripts/prepare-desktop.mjs', 'js/scripts/validate-desktop-runtime.mjs',
            '.github/workflows/desktop-release.yml', 'package.json']
bundle(root, sources, 'docs/case-studies/issue-56/data/desktop-native-prebuilds.tar.gz',
       {'parent': parent, 'hostedRun': 43811953283, 'failedPackagingJobs': 5,
        'newRegressionCases': 7, 'focusedNode': 26, 'focusedDeno': 26,
        'nativeVerifier': 'enabled', 'localInstallersBuilt': False,
        'hostedAcceptance': 'pending', 'acceptedInventoryRows': [],
        'remainingRows': 60}, 'issue-56-desktop-native-prebuilds-no-screenshots-*',
       before={'desktop/electron-builder.config.cjs': parent})
