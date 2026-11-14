"""Run one bounded native batch scenario; preserve the user's existing bundle."""
import sys
from application_native_probe import run_application_native
run_application_native(__file__, 'application-batch', 'job-application-batch',
    mcp='--mcp' in sys.argv, mcp_env={'APPLICATION_BATCH_FIXTURE': '1', 'APPLICATION_DRAFT_FIXTURE': '1'})
