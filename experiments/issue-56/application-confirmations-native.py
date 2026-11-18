"""Run the finite application-confirmations browser or independent MCP fixture."""
import sys
from application_native_probe import run_application_native

run_application_native(__file__, 'application-confirmations', 'job-application-confirmations',
                       mcp='--mcp' in sys.argv, mcp_env={'APPLICATION_DRAFT_FIXTURE': '1'})
