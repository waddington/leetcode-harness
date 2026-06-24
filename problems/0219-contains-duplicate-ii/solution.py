# 219. Contains Duplicate II  [Easy]
# https://leetcode.com/problems/contains-duplicate-ii/
#
# Paste the LeetCode Python skeleton below (replacing the class body),
# then implement it. Run/Debug THIS file from your IDE to test.
from __future__ import annotations
from typing import List, Optional, Dict, Set, Tuple  # noqa: F401

from leetcode_harness import run_tests


class Solution:
    # brute-force, iterate all, badly efficient
    # def containsNearbyDuplicate_v1(self, nums: List[int], k: int) -> bool:
    #     for idx_i, num_i in enumerate(nums):
    #         for idx_j in range(idx_i+1, min(len(nums), idx_i+k+1)):
    #             num_j = nums[idx_j]
    #             if num_i == num_j and abs(idx_i - idx_j) <= k:
    #                 print(f"idx_i: {idx_i}, idx_j: {idx_j}, num_i: {num_i}, num_j: {num_j}")
    #                 print("About to return True")
    #                 return True
    #     return False

    # dont check twice
    # def containsNearbyDuplicate_v2(self, nums: List[int], k: int) -> bool:
    #     seen: Dict[int, int] = {}  # number --> idx[]
    #     for idx_i, num in enumerate(nums):
    #         seen_index = seen.get(num, None)
    #         if seen_index is None:
    #             seen[num] = idx_i
    #         else:
    #             if abs(idx_i - seen_index) <= k:
    #                 # print(f"idx_i: {idx_i}, num: {num}, idx: {seen_index}")
    #                 # print("About to return True")
    #                 return True
    #             seen[num] = idx_i
    #     return False

    def containsNearbyDuplicate(self, nums: List[int], k: int) -> bool:
        seen: Dict[int, int] = {}  # number --> idx[]
        for idx_i, num in enumerate(nums):
            if num in seen and abs(idx_i - seen[num]) <= k:
                return True
            seen[num] = idx_i
        return False
        


if __name__ == "__main__":
    # Tests live in test_cases.txt next to this file (LeetCode example syntax).
    # For problems where any valid ordering is accepted, use unordered=True.
    # To debug one failing case, isolate it with e.g. only=3 (or only=[1,3]).
    run_tests(Solution)
