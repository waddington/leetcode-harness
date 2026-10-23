"""Scaffold a new problem directory: solution.py / solution.ts + test_cases.txt."""

from __future__ import annotations

import os
import re
import textwrap

from .leetcode_api import Problem, fetch_problem

# Repo root = parent of this package directory.
_PKG_DIR = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_PKG_DIR)
PROBLEMS_DIR = os.path.join(_ROOT, "problems")

# Language key (as passed to --lang) -> solution file name.
SOLUTION_FILES = {"py": "solution.py", "ts": "solution.ts"}


def _slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


def _dir_name(number: int, slug: str) -> str:
    return f"{number:04d}-{slug}"


def _existing_dir(number: int) -> str | None:
    """An already-scaffolded directory for this problem number, if any."""
    if not os.path.isdir(PROBLEMS_DIR):
        return None
    prefix = f"{number:04d}-"
    for name in sorted(os.listdir(PROBLEMS_DIR)):
        path = os.path.join(PROBLEMS_DIR, name)
        if name.startswith(prefix) and os.path.isdir(path):
            return path
    return None


_DEFAULT_SKELETON = textwrap.dedent(
    '''\
    class Solution:
        def solve(self, *args, **kwargs):
            # TODO: rename this method to match the LeetCode signature,
            # e.g.  def containsNearbyDuplicate(self, nums: List[int], k: int) -> bool:
            pass
    '''
)

_DEFAULT_TS_SKELETON = textwrap.dedent(
    '''\
    function solve(...args: unknown[]): unknown {
        // TODO: replace with the LeetCode signature (and update runTests below),
        // e.g.  function containsNearbyDuplicate(nums: number[], k: number): boolean {
        return undefined;
    }
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


def _strip_ts_comments(code: str) -> str:
    code = re.sub(r"/\*.*?\*/", "", code, flags=re.S)
    return re.sub(r"//.*", "", code)


def _ts_solution_file(problem: Problem, skeleton: str) -> str:
    header = f"// {problem.number}. {problem.title}"
    if problem.difficulty:
        header += f"  [{problem.difficulty}]"
    url_line = f"// {problem.url}" if problem.url else ""

    skeleton = skeleton.strip("\n") or _DEFAULT_TS_SKELETON.rstrip("\n")
    code = _strip_ts_comments(skeleton)

    # Node classes are referenced in LeetCode's signatures but only *defined*
    # in a comment, so import the real ones from the harness.
    imports = ["runTests"] + [n for n in ("ListNode", "TreeNode") if re.search(rf"\b{n}\b", code)]

    m = re.search(r"\bfunction\s+([A-Za-z_$][\w$]*)\s*\(", code)
    if m:
        run_line = f"runTests({m.group(1)});"
    else:
        # e.g. design problems, whose skeleton is a class: not supported yet.
        run_line = "// runTests(...);  // no top-level function found in the skeleton"

    return textwrap.dedent(
        '''\
        {header}
        {url_line}
        //
        // Paste the LeetCode TypeScript skeleton below (replacing the function),
        // then implement it. Run/Debug THIS file from your IDE to test.
        import {{ {imports} }} from "#harness";


        {skeleton}


        // Tests live in test_cases.txt next to this file (LeetCode example syntax).
        // Pass your function here; rename it if you paste a different skeleton.
        // For problems where any valid ordering is accepted, pass {{ unordered: true }}.
        // To debug one failing case, isolate it with e.g. {{ only: 3 }} (or {{ only: [1, 3] }}).
        {run_line}
        '''
    ).format(
        header=header,
        url_line=url_line,
        imports=", ".join(imports),
        skeleton=skeleton,
        run_line=run_line,
    )


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


def create_problem(
    number: int, *, lang: str = "py", offline: bool = False, force: bool = False
) -> tuple[str, list[str]]:
    """Create problems/NNNN-slug/ with a solution file and test_cases.txt.

    `lang` is "py" or "ts". If the problem is already scaffolded (e.g. in the
    other language), the solution file is added to that directory and its
    test_cases.txt is kept unless `force`.

    Returns (directory, paths written). Fetches metadata from LeetCode unless
    offline (or the fetch fails, in which case it falls back gracefully).
    """
    if lang not in SOLUTION_FILES:
        raise ValueError(f"Unknown language {lang!r}; expected one of {sorted(SOLUTION_FILES)}.")

    problem: Problem | None = None
    if not offline:
        try:
            problem = fetch_problem(number)
        except Exception as exc:  # network/lookup issues -> fall back
            print(f"  (couldn't fetch from LeetCode: {exc}; creating blank template)")

    if problem is None:
        problem = Problem(number=number, title=f"problem-{number}", slug=f"problem-{number}")

    target = _existing_dir(problem.number) or os.path.join(
        PROBLEMS_DIR, _dir_name(problem.number, problem.slug)
    )
    sol_path = os.path.join(target, SOLUTION_FILES[lang])
    tc_path = os.path.join(target, "test_cases.txt")

    if os.path.exists(sol_path) and not force:
        raise FileExistsError(f"{sol_path} already exists (use --force to overwrite).")
    os.makedirs(target, exist_ok=True)

    if lang == "ts":
        content = _ts_solution_file(problem, problem.ts_skeleton)
    else:
        content = _solution_file(problem, problem.skeleton)
    written = [sol_path]
    with open(sol_path, "w", encoding="utf-8") as f:
        f.write(content)
    if force or not os.path.exists(tc_path):
        with open(tc_path, "w", encoding="utf-8") as f:
            f.write(_test_cases_file(problem))
        written.append(tc_path)

    return target, written
