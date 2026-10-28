"""Small offline byte-preservation regressions for the evidence conversion."""
import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('evidence_bundle', Path(__file__).with_name('issue43-evidence-bundle.py'))
bundle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bundle)


class EvidenceBundleTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='issue43-evidence-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.dest = self.root / 'evidence'
        self.dest.mkdir()
        self.files = {
            'ci-logs/raw.log': b'original\r\nbytes\x00\xff\r\n',
            'templates/reference.sh': b'#!/bin/sh\nexit 99\n',
            'research/result.json': b'{"preserved":true}\n',
        }
        for name, data in self.files.items():
            target = self.dest / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        for name, value in (
            ('ROOT', self.root), ('DEST', self.dest),
            ('MANIFEST', self.dest / 'evidence-files.tsv'),
            ('CHECKSUMS', self.dest / 'evidence.sha256'),
        ):
            change = patch.object(bundle, name, value)
            change.start()
            self.addCleanup(change.stop)
        names = b'\0'.join(f'evidence/{name}'.encode() for name in self.files) + b'\0'
        with patch.object(bundle.subprocess, 'check_output', return_value=names):
            bundle.pack()

    def test_deterministic_round_trip_retains_raw_bytes_without_execution(self):
        before = {path.name: path.read_bytes() for path in self.dest.glob('evidence-*.tar.gz')}
        with patch.object(bundle.subprocess, 'check_output', return_value=b''):
            bundle.pack()
        self.assertEqual({path.name: path.read_bytes() for path in self.dest.glob('evidence-*.tar.gz')}, before)
        for name in self.files:
            (self.dest / name).unlink()
        bundle.verify(restore=True)
        for name, data in self.files.items():
            self.assertEqual((self.dest / name).read_bytes(), data)

    def test_restore_refuses_to_overwrite_changed_local_evidence(self):
        target = self.dest / 'ci-logs/raw.log'
        target.write_bytes(b'new local investigation')
        with self.assertRaisesRegex(ValueError, 'Refusing to overwrite'):
            bundle.verify(restore=True)
        self.assertEqual(target.read_bytes(), b'new local investigation')

    def test_corrupted_bundle_is_rejected_before_restore(self):
        with (self.dest / 'evidence-ci-logs.tar.gz').open('ab') as output:
            output.write(b'changed')
        with self.assertRaisesRegex(ValueError, 'Checksum mismatch'):
            bundle.verify(restore=True)


if __name__ == '__main__':
    unittest.main()
