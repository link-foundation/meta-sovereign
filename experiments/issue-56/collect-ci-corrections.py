"""Keep the independently reviewable catalog and fixture corrections bounded."""
import sys
from evidence_bundle import bundle, evidence_context

root, logs, read = evidence_context(__file__, 'ci-corrections')
kind = sys.argv[1]
assert kind in ('preset-catalog', 'sync-fixture-bundle')
assert 'pass 17' in read('node') and 'fail 0' in read('node')
assert '17 passed | 0 failed' in read('deno')
assert not read('lint-final').strip()
assert not read('secrets').strip() and not read('diff').strip()
assert 'All matched files use Prettier code style!' in read('format-final')
common = ['experiments/issue-56/collect-ci-corrections.py']
common += [f'ci-logs/ci-corrections-{name}.log' for name in
           ('node', 'deno', 'lint-final', 'secrets', 'diff', 'format-final')]
if kind == 'preset-catalog':
    names = ['js/src/automation/contextual-replies.js', 'js/tests/automations-server.test.js',
             'js/tests/automations-view.test.js', 'ci-logs/preset-catalog-before.log',
             'ci-logs/e386-checks-current.json', 'ci-logs/e386-all-runs-current.json']
    names += [str(path.relative_to(root)) for path in logs.glob('e386-*.log')]
    assert 'fail 2' in (logs / 'preset-catalog-before.log').read_text()
    parent = 'e386d58b'
else:
    names = ['js/tests/helpers/e2e-sync-peer.mjs', 'js/tests/helpers/e2e-sync-bundle.mjs',
             'js/tests/sync-fixture-bundle.test.js',
             'experiments/issue-56/sync-fixture-bundle-parent.py',
             'experiments/issue-56/sync-fixture-bundle.mjs',
             'ci-logs/checks-43677439888-webkit-1.log']
    names += [str(path.relative_to(root)) for path in logs.glob('sync-fixture-bundle-*.log')]
    assert 'route.fetch: read ECONNRESET' in (logs / 'sync-fixture-bundle-before.log').read_text()
    native = (logs / 'sync-fixture-bundle-native.log').read_text()
    assert '"convergence":true' in native and '"mockCapture":true' in native
    assert '[e2e-sync-fixture-bundle] OK (webkit)' in native
    parent = 'd6841cad'
names.append(f'docs/case-studies/issue-56/ci-{kind}.md')
before = {name: parent for name in names if name.startswith('js/') and name !=
          'js/tests/helpers/e2e-sync-bundle.mjs' and name != 'js/tests/sync-fixture-bundle.test.js'}
bundle(root, common + names, f'docs/case-studies/issue-56/data/ci-{kind}.tar.gz',
       dict(parent=parent, focused_node=17, focused_deno=17,
            full_local_suite=False, exact_head_ci_pending=True, issue_complete=False),
       '__no_screenshots__', before=before)
