"""Compile only the std-only core and finite register cases, sequentially."""
from pathlib import Path
import argparse
import subprocess
import tempfile
import resource
import time

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
mode = parser.add_mutually_exclusive_group()
mode.add_argument('--before', action='store_true')
mode.add_argument('--clippy', action='store_true')
args = parser.parse_args()
prefix = ('native-register-parent' if args.before else
          'native-register-clippy' if args.clippy else 'native-register-focused')
logs = root / 'ci-logs'
logs.mkdir(exist_ok=True)

with tempfile.TemporaryDirectory(prefix='native-register-', dir=root / 'experiments/issue-56') as directory:
    work = Path(directory)
    library = root / 'rust/crates/meta-sovereign-core/src/lib.rs'
    if args.before:
        library = work / 'lib.rs'
        library.write_bytes(subprocess.check_output(['git', 'show', '8b1c19ba:rust/crates/meta-sovereign-core/src/lib.rs'], cwd=root))
    rlib = work / 'libmeta_sovereign_core.rlib'
    def compile_rust(source, output, *extra):
        with (logs / f'{prefix}-compile.log').open('a') as log:
            started = time.perf_counter()
            subprocess.run(['clippy-driver' if args.clippy else 'rustc',
                            '--edition=2024', '-C', 'debuginfo=0', '-D', 'warnings',
                            *extra, str(source), '-o', str(output)], cwd=root,
                           stdout=log, stderr=subprocess.STDOUT, check=True)
            log.write(f'child_peak_rss_kib={resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss} elapsed={time.perf_counter() - started:.3f}\n')
    (logs / f'{prefix}-compile.log').write_text('')
    compile_rust(library, rlib, '--crate-name', 'meta_sovereign_core', '--crate-type', 'rlib')
    cases = [root / 'rust/crates/meta-sovereign-core/tests/sync_register.rs']
    if args.before:
        case = work / 'parent.rs'
        case.write_text(cases[0].read_text().split('// Checked metadata regressions.')[0])
        cases = [case]
    else:
        cases.append(root / 'rust/crates/meta-sovereign-core/tests/sync_reference.rs')
    with (logs / f'{prefix}.log').open('w') as log:
        for index, case in enumerate(cases):
            binary = work / f'cases-{index}'
            compile_rust(case, binary, '--test', '--extern', f'meta_sovereign_core={rlib}')
            if args.clippy:
                continue
            result = subprocess.run([str(binary), '--test-threads=1'], cwd=root,
                                    stdout=log, stderr=subprocess.STDOUT)
            if args.before:
                assert result.returncode != 0, 'the exact parent must reproduce divergence'
            else:
                result.check_returncode()
    if args.before:
        assert '0 passed; 4 failed' in (logs / f'{prefix}.log').read_text()
print(f'{prefix}: finite checks verified; logs in ci-logs')
