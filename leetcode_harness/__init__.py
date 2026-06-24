"""leetcode-harness: a tiny local harness for practising LeetCode problems.

Public API:
    run_tests(Solution)  -- call from a problem's solution.py __main__ block.
"""

from .runner import run_tests
from .parser import parse_cases, parse_assignments, parse_value, TestCase

__all__ = ["run_tests", "parse_cases", "parse_assignments", "parse_value", "TestCase"]
