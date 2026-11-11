"""Bounded real Git-index regression for evidence source collection."""
from pathlib import Path
import runpy
import subprocess
import tempfile

project = Path(__file__).resolve().parents[2]
current = runpy.run_path(str(project / 'experiments/issue-56/evidence_bundle.py'))
previous = {}
exec(subprocess.check_output([
    'git', 'show', '8679a995b23211d5e036b390aff2dd50ec57a7ce:experiments/issue-56/evidence_bundle.py'],
    cwd=project), previous)
with tempfile.TemporaryDirectory(prefix='evidence-index-') as temporary:
    root = Path(temporary)
    git = lambda *args: subprocess.run(['git', *args], cwd=root, check=True,
                                      stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    git('init', '--quiet')
    (root / 'existing.txt').write_text('before')
    git('add', '.')
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
        'commit', '-m', 'fixture')
    base = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root).decode().strip()
    (root / 'existing.txt').write_text('changed')
    (root / 'added.txt').write_text('new source')
    git('add', '.')
    (root / 'untracked.txt').write_text('also evidence')
    wanted = {'existing.txt', 'added.txt', 'untracked.txt'}
    assert set(previous['changed_sources'](root)) != wanted
    assert set(current['changed_sources'](root)) == wanted
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
        'commit', '-m', 'staged change')
    assert set(current['changed_sources'](root, base)) == wanted
print('Actual parent misses staged sources; fixed index and committed-unit capture pass')
