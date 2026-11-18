"""Preserve bounded résumé inventory evidence and exact parent regressions."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'resume-list')
parent = '56419934dcefb3c4acd319a9b04f2812038c7565'
assert 'pass 23' in read('node')
assert '23 passed | 0 failed' in read('deno')
assert 'pass 1' in read('registry')
assert '1 passed | 0 failed' in read('registry-deno')
assert read('parent-replay').splitlines() == [
    'service: expected parent failure 1', 'browser: expected parent failure 1']
assert 'service.resumes is not a function' in read('service-before')
assert '0 !== 1' in read('browser-before')
results = [json.loads(line.split('[browser-scenario] ')[1])['result']
           for line in read('browser-final').splitlines() if '"result":{' in line]
assert results == [dict(cases=6, opens=11, providerClicks=0, pageErrors=[]),
                   dict(cases=5, opens=6, providerClicks=0, pageErrors=[])]
mcp = json.loads((logs / 'resume-list-mcp-verified.json').read_text())
assert mcp['cases'] == 3 and mcp['reads'] == 1
assert mcp['nativeBrowserReads'] is False and mcp['providerClicks'] == 0
assert not mcp['pageErrors']
assert not read('lint').strip()
assert not read('secretlint').strip()
assert 'All matched files use Prettier code style!' in read('format-check')
assert 'ERROR' not in read('duplication')
bundle(root, [*changed_sources(root), *evidence_logs(root, 'resume-list'),
              *evidence_logs(root, 'hh-resume-reference', suffixes=('.log', '.json', '.mjs')),
              'ci-logs/resume-list-mcp-overlay.png'],
       'docs/case-studies/issue-56/data/job-resumes.tar.gz',
       dict(parent=parent, focused_per_runtime=23, registry_per_runtime=1,
            native=results, mcp=mcp,
            reference='konard/hh-job-application-automation@fa0991b8c2d0896fb3b4be6c69947f0590094b15',
            authenticated_provider=False,
            unfinished='Export language, native application selection and every unchecked issue criterion'),
       'issue-56-job-resumes/**/*.png',
       before={name: parent for name in (
           'js/src/jobs/service.js', 'js/src/web/vacancies-panel.js',
           'js/src/web/app.min.js')})
