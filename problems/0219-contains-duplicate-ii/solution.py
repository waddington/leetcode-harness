# 219. Contains Duplicate II  [Easy]
# https://leetcode.com/problems/contains-duplicate-ii/
#
# Paste the LeetCode Python skeleton below (replacing the class body),
# then implement it. Run/Debug THIS file from your IDE to test.
from __future__ import annotations
from typing import List, Optional, Dict, Set, Tuple  # noqa: F401

from leetcode_harness import run_tests


class Solution:
    def containsNearbyDuplicate(self, nums: List[int], k: int) -> bool:
        last_seen: Dict[int, int] = {}
        for i, n in enumerate(nums):
            if n in last_seen and i - last_seen[n] <= k:
                return True
            last_seen[n] = i
        return False


if __name__ == "__main__":
    # Tests live in test_cases.txt next to this file (LeetCode example syntax).
    # For problems where any valid ordering is accepted, use unordered=True.
    run_tests(Solution)
