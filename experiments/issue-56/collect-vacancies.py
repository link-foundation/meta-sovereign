"""Archive the finite vacancy unit, actual-parent failures and provider-free checks."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'vacancy')
parent = '727b3f6b30337d0f6de3041c7ab31d7b2b744cbf'
assert 'pass 27' in read('node-verified')
assert '27 passed | 0 failed' in read('deno-verified')
assert 'pass 1' in read('registry-verified')
assert '1 passed | 0 failed' in read('registry-deno-verified')
assert 'pass 4' in read('partitions-verified')
assert '4 passed | 0 failed' in read('partitions-deno-verified')
assert 'fail 2' in read('reader-before')
assert '0 !== 1' in read('browser-before')
native = next(json.loads(line.split('[browser-scenario] ')[1])['result']
              for line in read('browser-numbered-pagination').splitlines()
              if '"result":{"cases":5' in line)
assert native == dict(cases=5, opens=6, providerClicks=0, pageErrors=[])
mcp = json.loads((logs / 'vacancy-mcp-verified.json').read_text())
assert mcp['cases'] == 3 and mcp['opens'] == 2
assert mcp['closed'] and mcp['providerClicks'] == 0 and not mcp['pageErrors']
assert not read('lint-verified').strip()
assert not read('secretlint-verified').strip()
assert 'All matched files use Prettier code style!' in read('format-check-verified')
assert 'ERROR' not in read('duplication-verified')
bundle(root, [*changed_sources(root), *evidence_logs(root, 'vacancy'),
              *evidence_logs(root, 'hh-vacancy', suffixes=('.log', '.json', '.mjs'))],
       'docs/case-studies/issue-56/data/vacancies.tar.gz',
       dict(parent=parent, focused_per_runtime=27, registry_per_runtime=1,
            partitions_per_runtime=4, native=native, mcp=mcp,
            reference='konard/hh-job-application-automation@fa0991b8c2d0896fb3b4be6c69947f0590094b15',
            authenticated_provider=False,
            unfinished='Full HH resume/application/live parity and every unchecked inventory criterion'),
       'issue-56-vacancies/**/*.png',
       before={name: parent for name in (
           'js/src/assignments/read-page.js',
           'js/src/assignments/vacancy-reader.js',
           'js/src/assignments/vacancy.js')})
