"""Compile only real std-only rich admission modules, with finite inputs."""
from pathlib import Path
import argparse
import resource
import subprocess
import tempfile
import time

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
mode = parser.add_mutually_exclusive_group()
mode.add_argument('--before', action='store_true')
mode.add_argument('--clippy', action='store_true')
args = parser.parse_args()
prefix = 'native-rich-' + ('parent' if args.before else 'clippy' if args.clippy else 'focused')
logs = root / 'ci-logs'
logs.mkdir(exist_ok=True)
core = root / 'rust/crates/meta-sovereign-core/src'
server = root / 'rust/crates/meta-sovereign-server/src'
marker = '// Native rich-record admission regressions.'
with tempfile.TemporaryDirectory(prefix='native-rich-', dir=root / 'experiments/issue-56') as directory:
    work = Path(directory)
    if args.before:
        def source(name):
            return subprocess.check_output(['git', 'show', 'b24e1ca5:' + name], cwd=root).decode()
        for name in ['lib.rs', 'sync.rs']:
            (work / name).write_text(source(f'rust/crates/meta-sovereign-core/src/{name}'))
        core = work
        state = work / 'state.rs'
        current = (server / 'state.rs').read_text()
        # The unchanged-API regression module is the final item in the source.
        cases = current.split(marker, 1)[1].split('pub struct ServerState', 1)[0]
        state.write_text(source('rust/crates/meta-sovereign-server/src/state.rs') + '\n' + marker + cases)
    else:
        state = server / 'state.rs'
    wrapper = work / 'server.rs'
    wrapper.write_text(
        f'#[path = "{server / "json.rs"}"] pub mod json;\n' +
        ('' if args.before else f'#[path = "{server / "record_sync.rs"}"] pub mod record_sync;\n') +
        f'#[path = "{state}"] pub mod state;\npub use state::ServerState;\n')
    with (logs / f'{prefix}-compile.log').open('w') as compile_log:
        def compile_rust(source, destination, *extra):
            started = time.perf_counter()
            subprocess.run(['clippy-driver' if args.clippy else 'rustc', '--edition=2024',
                            '-C', 'debuginfo=0', '-D', 'warnings', '-L', f'dependency={work}',
                            *extra, str(source), '-o', str(destination)], cwd=root,
                           stdout=compile_log, stderr=subprocess.STDOUT, check=True)
            compile_log.write(f'child_peak_rss_kib={resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss} elapsed={time.perf_counter() - started:.3f}\n')
            compile_log.flush()
        library = work / 'libmeta_sovereign_core.rlib'
        compile_rust(core / 'lib.rs', library, '--crate-name', 'meta_sovereign_core', '--crate-type', 'rlib')
        external = ['--extern', f'meta_sovereign_core={library}']
        tests = [(wrapper, ['native_parent_' if args.before else 'native_'])]
        if not args.before:
            native = work / 'libmeta_sovereign_server.rlib'
            compile_rust(wrapper, native, '--crate-name', 'meta_sovereign_server', '--crate-type', 'rlib', *external)
            tests.append((root / 'rust/crates/meta-sovereign-server/tests/rich_sync.rs', ['native_rich_']))
            external += ['--extern', f'meta_sovereign_server={native}']
        with (logs / f'{prefix}.log').open('w') as log:
            for i, (case, filters) in enumerate(tests):
                binary = work / f'cases-{i}'
                compile_rust(case, binary, '--test', *external)
                if not args.clippy:
                    result = subprocess.run([str(binary), *filters, '--test-threads=1'], cwd=root,
                                            stdout=log, stderr=subprocess.STDOUT)
                    if args.before:
                        assert result.returncode != 0
                    else:
                        result.check_returncode()
    if args.before:
        assert '0 passed; 4 failed' in (logs / f'{prefix}.log').read_text()
print(f'{prefix}: finite checks verified; logs in ci-logs')
