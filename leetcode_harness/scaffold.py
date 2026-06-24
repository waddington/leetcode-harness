"""Scaffold a new problem directory: solution.py + test_cases.txt."""

from __future__ import annotations

import os
import re
import textwrap

from .leetcode_api import Problem, fetch_problem

# Repo root = parent of this package directory.
_PKG_DIR = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_PKG_DIR)
PROBLEMS_DIR = os.path.join(_ROOT, "problems")


def _slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


def _dir_name(number: int, slug: str) -> str:
    return f"{number:04d}-{slug}"


_DEFAULT_SKELETON = textwrap.dedent(
    '''\
    class Solution:
        def solve(self, *args, **kwargs):
            # TODO: rename this method to match the LeetCode signature,
            # e.g.  def containsNearbyDuplicate(self, nums: List[int], k: int) -> bool:
            pass
    '''
)


def _solution_file(problem: Problem, skeleton: str) -> str:
    header = f"# {problem.number}. {problem.title}"
    if problem.difficulty:
        header += f"  [{problem.difficulty}]"
    url_line = f"# {problem.url}" if problem.url else ""

    skeleton = skeleton.strip("\n") or _DEFAULT_SKELETON.rstrip("\n")

    return textwrap.dedent(
        '''\
        {header}
        {url_line}
        #
        # Paste the LeetCode Python skeleton below (replacing the class body),
        # then implement it. Run/Debug THIS file from your IDE to test.
        from __future__ import annotations
        from typing import List, Optional, Dict, Set, Tuple  # noqa: F401

        from leetcode_harness import run_tests


        {skeleton}


        if __name__ == "__main__":
            # Tests live in test_cases.txt next to this file (LeetCode example syntax).
            # For problems where any valid ordering is accepted, use unordered=True.
            # To debug one failing case, isolate it with e.g. only=3 (or only=[1,3]).
            run_tests(Solution)
        '''
    ).format(header=header, url_line=url_line, skeleton=skeleton)


def _test_cases_file(problem: Problem) -> str:
    examples = problem.examples_text.strip()
    body = examples if examples else (
        "Input: \n"
        "Output: "
    )
    return textwrap.dedent(
        """\
        # Test cases for {number}. {title}
        # Paste LeetCode examples verbatim. Format:
        #   Input: nums = [1,2,3,1], k = 3
        #   Output: true
        # Separate cases with a new "Input:" line. Lines starting with # are ignored.

        """
    ).format(number=problem.number, title=problem.title) + body + "\n"


def create_problem(number: int, *, offline: bool = False, force: bool = False) -> str:
    """Create problems/NNNN-slug/ with solution.py and test_cases.txt.

    Returns the created directory path. Fetches metadata from LeetCode unless
    offline (or the fetch fails, in which case it falls back gracefully).
    """
    problem: Problem | None = None
    if not offline:
        try:
            problem = fetch_problem(number)
        except Exception as exc:  # network/lookup issues -> fall back
            print(f"  (couldn't fetch from LeetCode: {exc}; creating blank template)")

    if problem is None:
        problem = Problem(number=number, title=f"problem-{number}", slug=f"problem-{number}")

    dir_name = _dir_name(problem.number, problem.slug)
    target = os.path.join(PROBLEMS_DIR, dir_name)
    os.makedirs(PROBLEMS_DIR, exist_ok=True)

    if os.path.exists(target) and not force:
        raise FileExistsError(f"{target} already exists (use --force to overwrite).")
    os.makedirs(target, exist_ok=True)

    sol_path = os.path.join(target, "solution.py")
    tc_path = os.path.join(target, "test_cases.txt")
    with open(sol_path, "w", encoding="utf-8") as f:
        f.write(_solution_file(problem, problem.skeleton))
    with open(tc_path, "w", encoding="utf-8") as f:
        f.write(_test_cases_file(problem))

    return target
