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
unit_mode = parser.add_mutually_exclusive_group()
unit_mode.add_argument('--owner', action='store_true')
unit_mode.add_argument('--storage', action='store_true')
args = parser.parse_args()
if args.storage and args.before:
    parser.error('storage admission uses a new API; use the unchanged CLI restart reproducer for the parent')
unit = 'storage' if args.storage else 'owner' if args.owner else 'rich'
routes = args.owner or args.storage
prefix = f'native-{unit}-' + ('parent' if args.before else 'clippy' if args.clippy else 'focused')
logs = root / 'ci-logs'
logs.mkdir(exist_ok=True)
core = root / 'rust/crates/meta-sovereign-core/src'
server = root / 'rust/crates/meta-sovereign-server/src'
marker = '// Native rich-record admission regressions.'
with tempfile.TemporaryDirectory(prefix=f'native-{unit}-', dir=root / 'experiments/issue-56') as directory:
    work = Path(directory)
    if args.before:
        def source(name):
            revision = 'bd954afd' if args.owner else 'b24e1ca5'
            return subprocess.check_output(['git', 'show', revision + ':' + name], cwd=root).decode()
        for name in ['lib.rs', 'sync.rs']:
            (work / name).write_text(source(f'rust/crates/meta-sovereign-core/src/{name}'))
        core = work
        state = work / 'state.rs'
        if args.owner:
            for name in ['state.rs', 'record_sync.rs', 'handlers.rs', 'email.rs', 'routes.rs']:
                (work / name).write_text(source(f'rust/crates/meta-sovereign-server/src/{name}'))
        else:
            current = (server / 'state.rs').read_text()
            # The unchanged-API regression module is the final item in the source.
            cases = current.split(marker, 1)[1].split('pub struct ServerState', 1)[0]
            state.write_text(source('rust/crates/meta-sovereign-server/src/state.rs') + '\n' + marker + cases)
    else:
        state = server / 'state.rs'
    wrapper = work / 'server.rs'
    modules = work if args.before and args.owner else server
    http = (server / 'http.rs').read_text()
    http = '#[derive(Debug, Clone)]\npub struct Request' + http.split(
        '#[derive(Debug, Clone)]\npub struct Request', 1)[1].split(
        '#[derive(Default, Clone, Copy, PartialEq, Eq)]', 1)[0]
    owner_modules = (
        'pub mod http { use std::collections::BTreeMap;\n' + http + '}\n' +
        ''.join(f'#[path = "{modules / (name + ".rs")}"] pub mod {name};\n'
                for name in ['handlers', 'email', 'routes'])) if routes else ''
    wrapper.write_text(
        f'#[path = "{server / "json.rs"}"] pub mod json;\n' +
        ('' if args.before and not args.owner else f'#[path = "{modules / "record_sync.rs"}"] pub mod record_sync;\n') +
        f'#[path = "{state}"] pub mod state;\npub use state::ServerState;\n' + owner_modules)
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
        tests = [] if routes else [(wrapper, ['native_parent_' if args.before else 'native_'])]
        if not args.before or args.owner:
            native = work / 'libmeta_sovereign_server.rlib'
            compile_rust(wrapper, native, '--crate-name', 'meta_sovereign_server', '--crate-type', 'rlib', *external)
            case_name = 'storage_admission' if args.storage else f'{unit}_sync'
            case = root / f'rust/crates/meta-sovereign-server/tests/{case_name}.rs'
            if args.before:
                parent_case = work / 'owner-before.rs'
                parent_case.write_text(case.read_text().split('// Checked owner refusals.', 1)[0])
                case = parent_case
            tests.append((case, [f'native_{unit}_']))
            if args.storage:
                tests.append((root / 'rust/crates/meta-sovereign-server/tests/checkpoint_file.rs', ['checkpoint_']))
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
