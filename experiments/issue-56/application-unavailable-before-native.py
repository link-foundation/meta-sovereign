"""Capture the actual parent UI missing an account-unavailable warning."""
import sys
import subprocess
from application_parent_fixture import published_application_sources, run_parent_application_probe, serve_parent_application

with published_application_sources(__file__, '13623bf7') as (root, env):
    if '--mcp' in sys.argv:
        bundle = root / 'js/src/web/app.min.js'
        original = bundle.read_bytes()
        try:
            subprocess.run(['node', 'js/scripts/build-web.mjs'], cwd=root, env=env, check=True)
            serve_parent_application(root, env, 'application-unavailable', {
                'APPLICATION_POPUP_FIXTURE': '1', 'APPLICATION_UNAVAILABLE_FIXTURE': '1',
            })
        finally:
            bundle.write_bytes(original)
    else:
        log, result = run_parent_application_probe(root, env, 'application-unavailable', [
            'node', 'experiments/issue-56/application-unavailable-native.mjs', '--before',
        ], native=True)
        assert result.returncode != 0, 'Expected missing account-unavailable handling.'
        assert '0 !== 1' in log.read_text(), log.read_text()
        assert (root / 'docs/screenshots/issue-56-application-unavailable/vacancy-unavailable-before.png').is_file()
        print(f'Actual parent native warning failure captured: {log}')
