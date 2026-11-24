"""Run one native WebKit sync fixture with bounded opt-in boot diagnostics."""
import os
from pathlib import Path
import subprocess

environment = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384',
                   RUN_BROWSER_E2E='1', E2E_BROWSER='webkit',
                   CI_LINO_SYNC_DEBUG='1', E2E_ARTIFACT_DIR='ci-logs')
raise SystemExit(subprocess.run(['node', 'js/tests/e2e-lino-sync.mjs'],
    cwd=Path(__file__).resolve().parents[2], env=environment).returncode)
