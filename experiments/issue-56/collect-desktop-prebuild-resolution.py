"""Preserve hosted clean-install resolution errors and the finite corrected test."""
from evidence_bundle import evidence_context, write_hashed_archive
root, logs, read = evidence_context(__file__, 'desktop-prebuild-resolution')
assert 'pass 7' in read('node') and 'fail 0' in read('node')
assert '7 passed | 0 failed' in read('deno')
names = ['js/tests/desktop-native-prebuilds.test.js',
         'docs/case-studies/issue-56/desktop-native-prebuilds.md',
         'experiments/issue-56/collect-desktop-prebuild-resolution.py',
         'experiments/issue-56/evidence_bundle.py']
names += [f'ci-logs/{name}' for name in [
    'desktop-prebuild-resolution-node.log', 'desktop-prebuild-resolution-deno.log',
    'checks-43815507714-deno-linux-1.log', 'checks-43815507714-deno-windows-1.log',
    'desktop-43815507700.log', 'desktop-43815507700-latest.json']]
write_hashed_archive(root, root / 'docs/case-studies/issue-56/data/desktop-prebuild-resolution.tar.gz',
                     names, {'parent': '210ef3b0', 'focusedNode': 7, 'focusedDeno': 7,
                             'hostedAccepted': False, 'remainingRows': 60}, 1)
