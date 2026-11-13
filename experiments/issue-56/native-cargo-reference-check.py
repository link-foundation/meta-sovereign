"""Finite std-only actual-Cargo reproduction; no native server dependency build."""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile
from native_cargo_reference import build_reference

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
logs.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(prefix='cargo-reference-', dir=Path(__file__).parent) as directory:
    work = Path(directory)
    target = work / 'target'
    executable = target / 'debug/reference-fixture'
    source_trees = []
    for label, version in (('current', '0.2.0'), ('parent', '0.1.0')):
        tree = work / label
        (tree / 'src').mkdir(parents=True)
        (tree / 'Cargo.toml').write_text(f'[package]\nname="reference-fixture"\nversion="{version}"\nedition="2021"\n')
        (tree / 'src/main.rs').write_text(f'fn main() {{ println!("{label}"); }}\n')
        source_trees.append(tree)
    def command(tree):
        return ['cargo', 'build', '--offline', '-j', '1', '--manifest-path', str(tree / 'Cargo.toml'),
                '--target-dir', str(target)]
    def output(path):
        return subprocess.check_output([str(path)], text=True).strip()
    with (logs / 'native-cargo-reference.log').open('w') as log:
        def build(tree):
            subprocess.run(command(tree), stdout=log, stderr=subprocess.STDOUT, check=True)
        current, parent = source_trees
        build(current)
        original = work / 'original-cli'
        shutil.copy2(executable, original)
        build(parent)
        assert output(executable) == 'parent', 'unisolated reference build replaces the current CLI'
        os.replace(original, executable)
        assert output(executable) == 'current'
        reference = work / 'parent-cli'
        build_reference(command(parent), executable, reference, stdout=log, stderr=subprocess.STDOUT)
        assert output(reference) == 'parent'
        build(current)
        assert output(executable) == 'current', 'current CLI is preserved even when Cargo reports fresh'
        failing = ['python3', '-B', '-c',
                   'from pathlib import Path; import sys; Path(sys.argv[1]).write_bytes(b"failed build"); sys.exit(7)',
                   str(executable)]
        try:
            build_reference(failing, executable, work / 'failed-cli', stdout=log, stderr=subprocess.STDOUT)
        except subprocess.CalledProcessError as error:
            assert error.returncode == 7
        else:
            raise AssertionError('failed reference build must propagate')
        assert output(executable) == 'current', 'restore current executable after a failed build too'
        print('PASS actual Cargo: shared output overwrite, isolated parent, fresh current and failure cleanup')
    main = root / 'rust/crates/meta-sovereign-server/src/main.rs'
    header = main.read_text().split('\nuse ', 1)[0]
    bad = header.replace('//!   `meta-sovereign-rs serve', '//!   meta-sovereign-rs serve').replace('| --memory]`', '| --memory]')
    for label, text, expected in (('before', bad, False), ('after', header, True)):
        source = work / f'docs-{label}.rs'
        source.write_text(text + '\npub fn documented() {}\n')
        with (logs / f'native-rustdoc-{label}.log').open('w') as log:
            result = subprocess.run(['rustdoc', '-D', 'warnings', '--crate-name', 'cli_usage',
                                     str(source), '-o', str(work / f'docs-{label}')],
                                    stdout=log, stderr=subprocess.STDOUT)
        assert (result.returncode == 0) == expected, label
    assert 'unclosed HTML tag `dir`' in (logs / 'native-rustdoc-before.log').read_text()
    print('PASS actual CLI documentation: invalid tag before, warnings-denied rustdoc after')
