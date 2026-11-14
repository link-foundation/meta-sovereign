"""Build a reference CLI without replacing the current shared-cache executable."""
import os
from pathlib import Path
import shutil
import subprocess


def build_reference(command, executable: Path, destination: Path, **kwargs):
    # Cargo fingerprints are per source directory, but the final CLI pathname is
    # shared. A later fresh build need not relink that pathname after a different
    # source tree overwrites it. Keep dependencies cached and preserve its bytes.
    backup = destination.with_name(destination.name + '.current')
    shutil.copy2(executable, backup)
    try:
        # Missing final output also makes a cached reference build publish its
        # own executable, rather than trusting another tree's shared pathname.
        executable.unlink()
        subprocess.run(command, check=True, **kwargs)
        shutil.copy2(executable, destination)
    finally:
        os.replace(backup, executable)
