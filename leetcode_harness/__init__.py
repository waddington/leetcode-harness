"""leetcode-harness: a tiny local harness for practising LeetCode problems.

Public API:
    run_tests(Solution)  -- call from a problem's solution.py __main__ block.

Linked-list / tree problems work automatically: when your method is annotated
`head: Optional[ListNode]` or `root: Optional[TreeNode]`, array inputs in
test_cases.txt are built into real nodes (including cycles via `pos`), and node
results are serialised back to arrays for comparison. ListNode/TreeNode and the
builders are exported here too, in case you want them in a manual __main__.
"""

from .runner import run_tests
from .parser import parse_cases, parse_assignments, parse_value, TestCase
from .structures import (
    ListNode,
    TreeNode,
    build_linked_list,
    linked_list_to_list,
    build_tree,
    tree_to_list,
)

__all__ = [
    "run_tests",
    "parse_cases",
    "parse_assignments",
    "parse_value",
    "TestCase",
    "ListNode",
    "TreeNode",
    "build_linked_list",
    "linked_list_to_list",
    "build_tree",
    "tree_to_list",
]
