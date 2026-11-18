"""Bounded replay of the published line-limit failure and unchanged doc gates."""
import json
from pathlib import Path
import subprocess
import tempfile
import textwrap

root = Path(__file__).resolve().parents[2]
workflow = '.github/workflows/release.yml'
parent = subprocess.check_output(['git', 'show', f'9846a827:{workflow}'], cwd=root).decode()
current = (root / workflow).read_text()
checks = [('Check documentation file sizes', 'check-doc-line-limits.sh'),
          ('Check required documentation files exist', 'check-required-docs.sh')]
with tempfile.TemporaryDirectory(prefix='issue-56-workflow-modules-') as tmp:
    fixture = Path(tmp)
    subprocess.run(['git', 'init', '--quiet', str(fixture)], check=True)
    (fixture / '.github/workflows').mkdir(parents=True)
    path = fixture / workflow
    for phase, source, expected in [('before', parent, 1), ('after', current, 0)]:
        path.write_text(source)
        subprocess.run(['git', 'add', workflow], cwd=fixture, check=True)
        result = subprocess.run(['bash', str(root / 'js/scripts/check-file-line-limits.sh')],
                                cwd=fixture, capture_output=True, text=True)
        assert result.returncode == expected, result.stdout + result.stderr
        assert ('1506 lines' in result.stdout) == (phase == 'before')
        print(json.dumps(dict(phase=phase, lines=len(source.splitlines()),
                              code=result.returncode, output=result.stdout)))
    required = ['docs/BEST-PRACTICES.md', 'docs/CONTRIBUTING.md', 'docs/ROADMAP.md',
                'docs/REQUIREMENTS.md', 'README.md', 'CHANGELOG.md']
    for name in required:
        target = fixture / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text('documentation\n')
    for title, script in checks:
        block = parent.split(f'      - name: {title}\n        run: |\n', 1)[1]
        lines = []
        for line in block.splitlines():
            if line and not line.startswith('          '):
                break
            lines.append(line)
        original = textwrap.dedent('\n'.join(lines)).strip() + '\n'
        helper = root / 'js/scripts' / script
        assert helper.read_text().split('set -e\n', 1)[1] == original
        for scenario in range(3):
            expected = 0
            if script == 'check-doc-line-limits.sh':
                (fixture / 'docs/bounded document.md').write_text('x\n' * (2500 + scenario % 2))
                (fixture / 'docs/ignored.txt').write_text('x\n' * 2501)
                expected = scenario % 2
            elif scenario == 1:
                (fixture / required[0]).unlink()
                expected = 1
            else:
                (fixture / required[0]).write_text('documentation\n')
            old = subprocess.run(['bash', '-e', '-c', original], cwd=fixture,
                                 capture_output=True, text=True)
            new = subprocess.run(['bash', str(helper)], cwd=fixture,
                                 capture_output=True, text=True)
            assert (old.returncode, old.stdout, old.stderr) == (
                new.returncode, new.stdout, new.stderr), script
            assert new.returncode == expected, new.stdout + new.stderr
            print(json.dumps(dict(check=script, scenario=scenario, code=new.returncode,
                                  unchangedOutput=True)))
print('Published limit failure reproduced; six bounded documentation gate comparisons pass.')
