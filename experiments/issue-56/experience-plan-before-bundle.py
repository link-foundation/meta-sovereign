"""Build the parent UI for a truthful before screenshot, then restore every file."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
names = subprocess.check_output(['git', 'diff', '--name-only', '--', 'js/src/web'], cwd=root, text=True).splitlines()
saved = {name: (root / name).read_bytes() for name in names}
try:
    for name in names:
        (root / name).write_bytes(subprocess.check_output(['git', 'show', f'5e54935e:{name}'], cwd=root))
    with (root / 'ci-logs/experience-plan-before-build.log').open('w') as log:
        subprocess.run(['node', '--input-type=module', '-e', "import {build} from 'esbuild'; await build({entryPoints:['js/src/web/app.js'],outfile:'ci-logs/experience-plan-before-app.min.js',bundle:true,format:'esm',minify:true,target:['es2022'],external:['doublets-web'],define:{'process.env.NODE_ENV':JSON.stringify('production')}});"],
            cwd=root, stdout=log, stderr=subprocess.STDOUT, check=True,
            env={**os.environ, 'NODE_OPTIONS': '--max-old-space-size=192'})
finally:
    for name, content in saved.items():
        (root / name).write_bytes(content)
print('Built published parent UI; drafted source restored.')
