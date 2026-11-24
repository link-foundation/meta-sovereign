"""Keep the actual repeated-answer regression, native review and source bytes."""
from pathlib import Path
import json
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
prefix = 'question-repeated-answer'
def log(name):
    return (root / f'ci-logs/{prefix}-{name}.log').read_text()
assert 'fail 5' in log('before-node') and 'pass 1' in log('before-node')
assert 'pass 26' in log('compatibility') and 'fail 0' in log('compatibility')
assert '6 passed' in log('deno') and '0 failed' in log('deno')
for phase in ['before', 'after']:
    assert '"cases":1,"pageErrors":[],"liveProvider":false' in log(f'native-{phase}')
server = json.loads(log('mcp-server').splitlines()[-1])
assert server == dict(stats=dict(clicks=0, textSends=0, draft=''),
                      resourcesClosed=True, liveProvider=False)
mcp = json.loads((root / f'ci-logs/{prefix}-mcp.json').read_text())
assert '"phase":"review"' in mcp['content'][0]['text'] and not mcp.get('isError')
assert '0 errors' in log('lint-final')
assert not log('secrets').strip() and not log('diff').strip()
assert 'ERROR:' not in log('duplication')
sources = [f'js/src/automation/{name}.js' for name in [
    'automations', 'question-answers', 'question-chat-turn',
    'question-context', 'question-store', 'question-repetition']]
sources += ['js/tests/question-repeated-answer.test.js',
            'js/tests/helpers/e2e-question-browser-watch.mjs']
sources += [f'experiments/issue-56/{name}' for name in [
    'question-watch-ui.mjs', 'repeated-question-fixture.mjs',
    'repeated-question-mcp.mjs', 'repeated-question-mcp-server.mjs',
    'repeated-question-parent.py', 'parent_source_probe.py',
    'collect-question-repeated-answer.py', 'evidence_bundle.py']]
sources += ['docs/case-studies/issue-56/question-repeated-answer.md']
sources += ['js/src/web/app.min.js']
names = [*sources, *[str(p.relative_to(root)) for p in (root / 'ci-logs').glob(f'{prefix}-*')
                    if p.suffix in ['.log', '.json']]]
names += [str(p.relative_to(root)) for p in
          (root / 'docs/screenshots/issue-56-question-watch/after').glob('repeated-question-*.png')]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
for name in [*sources[:5], 'js/src/web/app.min.js']:
    entries[f'before/{name}'] = subprocess.check_output(['git', 'show', f'9636107f:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(parent='9636107f', focusedNode=26,
    focusedDeno=6, parentFailures=5, nativeCases=2, liveProvider=False,
    acceptance=False, hosted='pending'), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/question-repeated-answer.tar.gz', entries)
