"""Run the finite preview source checks without changing the duplication gate."""
from check_evidence import check_sources

check_sources(__file__, 'application-preview')
