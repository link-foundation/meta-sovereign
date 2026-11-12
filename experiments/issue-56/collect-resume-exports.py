"""Preserve verified native export, private recovery and independent UI evidence."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'resume-export')
parent = '3a6a49fdf06f20669972653d43db78945183c516'
assert 'pass 35' in read('node-final')
assert '12 passed | 0 failed' in read('deno-final')
assert 'pass 12' in read('ci-contracts')
assert read('parent-replay').splitlines() == [
    'service: expected parent failure 1', 'browser: expected parent failure 1']
assert 'service.resume-export is not a function' in read('service-before')
assert 'actual: 0' in read('browser-before')
results = [json.loads(line.split('[browser-scenario] ')[1])['result']
           for line in read('native-webkit-final-lino').splitlines() if '"result":{' in line]
assert results == [dict(cases=6, opens=6, downloads=27, dictionaries=7, providerClicks=0)]
mcp_tool = json.loads((logs / 'resume-export-mcp-result.json').read_text())
assert not mcp_tool.get('isError')
mcp = json.loads(mcp_tool['content'][0]['text'].split('### Result\n')[1].split('\n')[0])
counts = json.loads((logs / 'resume-export-mcp-counts.json').read_text())
assert mcp == dict(cases=4, exports=2, attachmentStatus=200, pageErrors=[])
assert counts['reads'] == 3 and counts['nativeBrowserReads'] is False
assert counts['providerClicks'] == 0
assert not read('lint-final').strip()
assert not read('secretlint').strip()
assert 'All matched files use Prettier code style!' in read('format-check')
assert 'ERROR' not in read('duplication-final')
sources = [name for name in changed_sources(root)
           if name != 'experiments/issue-56/resume-profile-navigation.mjs']
bundle(root, [*sources, *evidence_logs(root, 'resume-export'),
              *evidence_logs(root, 'hh-resume-reference', suffixes=('.log', '.json', '.mjs')),
              'ci-logs/resume-export-cookie-probe.log',
              'ci-logs/resume-export-preceding-ms-e2e-questions-webkit.png'],
       'docs/case-studies/issue-56/data/resume-exports.tar.gz',
       dict(parent=parent, focused_node=35, focused_deno=12, ci_contracts=12,
            native=results[0], mcp=dict(mcp, **counts),
            reference='konard/hh-job-application-automation@fa0991b8c2d0896fb3b4be6c69947f0590094b15',
            authenticated_provider=False,
            preceding_ci=dict(run=43162679447, job=130998380216,
                              failure='Question profile disclosure; root cause still under investigation'),
            unfinished='Authenticated live verification, application selection, complete CV editing/sync and every unchecked issue criterion'),
       'issue-56-resume-exports/**/*.png',
       before={name: parent for name in (
           'js/src/jobs/service.js', 'js/src/web/vacancies-panel.js',
           'js/src/web/app.min.js')})
