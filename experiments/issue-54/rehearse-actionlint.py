"""Verify the narrow self-repository compatibility exception with real tools."""

from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
IMAGE = 'rhysd/actionlint@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667'
source = (ROOT / '.github/workflows/release.yml').read_text()


def check(body):
    return subprocess.run(
        ['docker', 'run', '--rm', '-i', '-v', f'{ROOT}:/repo', '-w', '/repo',
         IMAGE, '-stdin-filename', '.github/workflows/release.yml', '-'],
        input=body, text=True, capture_output=True, cwd=ROOT)


valid = check(source)
assert valid.returncode == 0, valid.stdout + valid.stderr
invalid = check(source.replace('$/.github/actions/npm-cache', '$/.github/actions/missing', 1))
assert invalid.returncode != 0 and '$/.github/actions/missing' in invalid.stdout, invalid
shell = check(source.replace('run: node js/scripts/check-ci-workflows.mjs',
                             'run: echo $issue54_unset', 1))
assert shell.returncode != 0 and 'SC2086' in shell.stdout, shell
print('Known supported reference accepted; unknown action syntax and ShellCheck failures remain errors.')
print(invalid.stdout)
print(shell.stdout)
