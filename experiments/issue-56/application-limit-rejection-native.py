"""Run the finite application-limit-rejection browser or independent MCP fixture."""
import sys
from application_native_probe import run_application_native

run_application_native(__file__, 'application-limit-rejection', 'job-application-rejection',
                       mcp='--mcp' in sys.argv, mcp_env={'APPLICATION_LIMIT_FIXTURE': '1'})
