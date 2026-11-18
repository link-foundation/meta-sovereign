"""Run the finite dispatch Stop source checks and existing duplication gate."""
from check_evidence import check_sources

check_sources(__file__, 'dispatch-stop', duplication_dir='ci-logs/duplication-stop')
