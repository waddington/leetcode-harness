"""Command-line interface: scaffold and run LeetCode problems.

    uv run lc new 219          # scaffold problem 219 (fetches skeleton+examples)
    uv run lc new 219 --lang ts   # ...as TypeScript (solution.ts)
    uv run lc new 219 --offline
    uv run lc run 219          # run a problem's tests (every language it has)
    uv run lc run 219 --lang ts   # ...just the TypeScript one
    uv run lc list             # list scaffolded problems
"""

from __future__ import annotations

import argparse
import os
import re
import runpy
import shutil
import subprocess
import sys
import traceback

from .scaffold import PROBLEMS_DIR, SOLUTION_FILES, create_problem


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
        target, written = create_problem(
            args.number, lang=args.lang, offline=args.offline, force=args.force
        )
    except FileExistsError as exc:
        print(exc)
        return 1
    rel = os.path.relpath(target)
    sol_name = SOLUTION_FILES[args.lang]
    print(f"Created {rel}/")
    for path in written:
        print(f"  - {os.path.relpath(path)}")
    if not any(p.endswith("test_cases.txt") for p in written):
        print(f"  (kept existing {os.path.join(rel, 'test_cases.txt')}; "
              f"delete it and re-run to re-fetch the examples)")
    lang_flag = f" --lang {args.lang}" if len(_langs_in(target)) > 1 else ""
    print()
    print(f"Next: open {sol_name}, paste the skeleton, implement, then Run/Debug it")
    print(f"in your IDE — or:  uv run lc run {args.number}{lang_flag}")
    return 0


def _langs_in(problem_dir: str) -> list[str]:
    """Languages with a solution file in `problem_dir`, e.g. ["py", "ts"]."""
    return [
        lang for lang, name in SOLUTION_FILES.items()
        if os.path.exists(os.path.join(problem_dir, name))
    ]


# Node runs .ts files natively (type stripping on by default) from 22.18.
_MIN_NODE = (22, 18)


def _node_version(node: str) -> tuple[int, ...] | None:
    try:
        out = subprocess.run([node, "--version"], capture_output=True, text=True).stdout
    except OSError:
        return None
    m = re.match(r"v(\d+)\.(\d+)", out.strip())
    return (int(m.group(1)), int(m.group(2))) if m else None


def _run_ts(sol: str) -> int:
    """Run a solution.ts with Node (which strips the types itself)."""
    need = ".".join(map(str, _MIN_NODE))
    node = shutil.which("node")
    if node is None:
        print(f"Couldn't find `node` on PATH. TypeScript solutions need Node {need}+")
        print("(e.g. `asdf install nodejs latest`), or run solution.ts from your IDE.")
        return 1
    version = _node_version(node)
    if version is not None and version < _MIN_NODE:
        found = ".".join(map(str, version))
        print(f"`node` on PATH is v{found}; running .ts files directly needs Node {need}+.")
        return 1
    # Flush so our output (e.g. the per-language header) lands before node's.
    sys.stdout.flush()
    # LC_ONLY (set from --only) is inherited by the child process.
    return subprocess.run([node, sol], cwd=os.path.dirname(PROBLEMS_DIR)).returncode


def _run_solution(lang: str, sol: str) -> int:
    if lang == "ts":
        return _run_ts(sol)
    # Execute solution.py as __main__ so its run_tests(Solution) call fires.
    try:
        runpy.run_path(sol, run_name="__main__")
    except Exception:
        # e.g. a NameError at module level: report it, but let any other
        # language's solution still run.
        traceback.print_exc()
        return 1
    return 0


def _cmd_run(args: argparse.Namespace) -> int:
    target = _find_problem_dir(args.problem)
    if target is None:
        print(f"No problem matching {args.problem!r} in {PROBLEMS_DIR}")
        return 1
    # Without --lang, run every language the problem has (no default language).
    langs = [args.lang] if args.lang else _langs_in(target)
    if not langs:
        print(f"No solution file in {target}")
        return 1
    if args.lang and not os.path.exists(os.path.join(target, SOLUTION_FILES[args.lang])):
        number = os.path.basename(target).split("-", 1)[0].lstrip("0") or "0"
        print(f"No {SOLUTION_FILES[args.lang]} in {target}")
        print(f"Create it with:  uv run lc new {number} --lang {args.lang}")
        return 1
    # The runner reads LC_ONLY to isolate case(s); set it from --only so we
    # don't have to touch the solution's run_tests(...) call.
    if args.only:
        os.environ["LC_ONLY"] = args.only
    rc = 0
    for i, lang in enumerate(langs):
        name = SOLUTION_FILES[lang]
        if len(langs) > 1:
            print(("\n" if i else "") + f"── {name} " + "─" * (40 - len(name)))
        rc = max(rc, _run_solution(lang, os.path.join(target, name)))
    return rc


def _cmd_list(args: argparse.Namespace) -> int:
    if not os.path.isdir(PROBLEMS_DIR) or not os.listdir(PROBLEMS_DIR):
        print("No problems yet. Create one with:  uv run lc new <number>")
        return 0
    for name in sorted(os.listdir(PROBLEMS_DIR)):
        path = os.path.join(PROBLEMS_DIR, name)
        if os.path.isdir(path):
            langs = _langs_in(path)
            print(f"{name}  [{', '.join(langs)}]" if langs else name)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="lc", description="Local LeetCode practice harness")
    sub = parser.add_subparsers(dest="command", required=True)

    p_new = sub.add_parser("new", help="Scaffold a new problem by LeetCode number")
    p_new.add_argument("number", type=int, help="LeetCode problem number (e.g. 219)")
    p_new.add_argument("--lang", choices=sorted(SOLUTION_FILES), default="py",
                       help="Solution language (default: py)")
    p_new.add_argument("--offline", action="store_true", help="Skip fetching; blank template")
    p_new.add_argument("--force", action="store_true",
                       help="Overwrite the solution file if it exists (test_cases.txt is always kept)")
    p_new.set_defaults(func=_cmd_new)

    p_run = sub.add_parser("run", help="Run a scaffolded problem's tests")
    p_run.add_argument("problem", help="Problem number or directory name")
    p_run.add_argument("--only", help="Run only these 1-based case(s), e.g. 3 or 1,3")
    p_run.add_argument("--lang", choices=sorted(SOLUTION_FILES),
                       help="Run only this language's solution (default: all present)")
    p_run.set_defaults(func=_cmd_run)

    p_list = sub.add_parser("list", help="List scaffolded problems")
    p_list.set_defaults(func=_cmd_list)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
