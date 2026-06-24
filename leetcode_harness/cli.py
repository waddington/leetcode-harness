"""Command-line interface: scaffold and run LeetCode problems.

    uv run lc new 219          # scaffold problem 219 (fetches skeleton+examples)
    uv run lc new 219 --offline
    uv run lc run 219          # run a problem's tests
    uv run lc list             # list scaffolded problems
"""

from __future__ import annotations

import argparse
import os
import runpy
import sys

from .scaffold import PROBLEMS_DIR, create_problem


def _find_problem_dir(number_or_name: str) -> str | None:
    if not os.path.isdir(PROBLEMS_DIR):
        return None
    # Exact dir name match first.
    candidates = sorted(os.listdir(PROBLEMS_DIR))
    for name in candidates:
        if name == number_or_name:
            return os.path.join(PROBLEMS_DIR, name)
    # Then match by leading number (e.g. "219" -> "0219-...").
    try:
        num = int(number_or_name)
        prefix = f"{num:04d}-"
        for name in candidates:
            if name.startswith(prefix):
                return os.path.join(PROBLEMS_DIR, name)
    except ValueError:
        pass
    # Then substring match.
    for name in candidates:
        if number_or_name in name:
            return os.path.join(PROBLEMS_DIR, name)
    return None


def _cmd_new(args: argparse.Namespace) -> int:
    try:
        target = create_problem(args.number, offline=args.offline, force=args.force)
    except FileExistsError as exc:
        print(exc)
        return 1
    rel = os.path.relpath(target)
    print(f"Created {rel}/")
    print(f"  - {os.path.join(rel, 'solution.py')}")
    print(f"  - {os.path.join(rel, 'test_cases.txt')}")
    print()
    print("Next: open solution.py, paste the skeleton, implement, then Run/Debug it")
    print(f"in your IDE — or:  uv run lc run {args.number}")
    return 0


def _cmd_run(args: argparse.Namespace) -> int:
    target = _find_problem_dir(args.problem)
    if target is None:
        print(f"No problem matching {args.problem!r} in {PROBLEMS_DIR}")
        return 1
    sol = os.path.join(target, "solution.py")
    if not os.path.exists(sol):
        print(f"No solution.py in {target}")
        return 1
    # Execute solution.py as __main__ so its run_tests(Solution) call fires.
    runpy.run_path(sol, run_name="__main__")
    return 0


def _cmd_list(args: argparse.Namespace) -> int:
    if not os.path.isdir(PROBLEMS_DIR) or not os.listdir(PROBLEMS_DIR):
        print("No problems yet. Create one with:  uv run lc new <number>")
        return 0
    for name in sorted(os.listdir(PROBLEMS_DIR)):
        if os.path.isdir(os.path.join(PROBLEMS_DIR, name)):
            print(name)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="lc", description="Local LeetCode practice harness")
    sub = parser.add_subparsers(dest="command", required=True)

    p_new = sub.add_parser("new", help="Scaffold a new problem by LeetCode number")
    p_new.add_argument("number", type=int, help="LeetCode problem number (e.g. 219)")
    p_new.add_argument("--offline", action="store_true", help="Skip fetching; blank template")
    p_new.add_argument("--force", action="store_true", help="Overwrite if it exists")
    p_new.set_defaults(func=_cmd_new)

    p_run = sub.add_parser("run", help="Run a scaffolded problem's tests")
    p_run.add_argument("problem", help="Problem number or directory name")
    p_run.set_defaults(func=_cmd_run)

    p_list = sub.add_parser("list", help="List scaffolded problems")
    p_list.set_defaults(func=_cmd_list)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
