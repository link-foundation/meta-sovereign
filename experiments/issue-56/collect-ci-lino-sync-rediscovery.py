"""Preserve the proven hosted API reload race and separate reconnect limit."""
from evidence_bundle import bundle, changed_sources, evidence_context

root, logs, read = evidence_context(__file__, 'lino-sync-reload')
assert 'Expected actual-parent read failure' in read('parent')
assert 'globalThis.__msApi.get' in read('before')
assert '[e2e-lino-sync] OK (webkit)' in read('after')
assert 'reload' in read('after') and 'rediscovery' in read('after')
assert not read('lint').strip()
assert 'All matched files use Prettier code style!' in read('static')
assert not read('secrets').strip()
assert 'ERROR' not in read('duplication')
assert 'timed out: WebRTC deletion' in (logs / 'lino-sync-connected-deletion.log').read_text()
assert 'pass 28' in (logs / 'cv-translation-integration-tests.log').read_text()
assert '[e2e-cv-translation] OK (webkit)' in (logs / 'cv-translation-integration-investigation.log').read_text()
sources = changed_sources(root)
sources += [f'ci-logs/lino-sync-reload-{name}.log' for name in
            ('parent', 'before', 'after', 'lint', 'static', 'secrets', 'duplication')]
sources += ['ci-logs/checks-43254148533-webkit-4.log',
            'ci-logs/lino-sync-connected-parent.log',
            'ci-logs/lino-sync-connected-deletion.log']
sources += [f'ci-logs/cv-translation-integration-{name}.log' for name in
            ('tests', 'lint', 'browser', 'investigation')]
sources += ['js/src/cli/vacancy-commands.js', 'js/src/jobs/service.js',
            'js/src/server/routes-vacancies.js', 'js/src/web/vacancies-panel.js',
            'js/src/web/vacancy-api.js', 'js/src/web/server-follow.js']
bundle(root, sources,
       'docs/case-studies/issue-56/data/ci-lino-sync-rediscovery.tar.gz',
       dict(regression_parent='2389fc8e2e3c8ae72277d0becc720dd56c6b06f5',
            integration='fe7217ea', failed_run=43254148533, failed_job=131312063036,
            root_cause='Offline rediscovery reload replaces the booted API document',
            parent_regressions=1, native_webkit_checks=1,
            integrated_node_checks=28, integrated_translation_browser_cases=6,
            unchanged_convergence_ms=20000, unchanged_deletion_ms=10000,
            unfinished='Connected-peer RTC reload, unexplained initial translation disabled-button timeout, exact-head hosted checks, full issue requirements'),
       'issue-56-cv-translation/**/*.png',
       before={'js/tests/e2e-lino-sync.mjs': '2389fc8e2e3c8ae72277d0becc720dd56c6b06f5'})
