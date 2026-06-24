"""Run a Solution against parsed test cases and report PASS/FAIL.

Designed to be called from a problem's `solution.py` `__main__` block so you
can Run/Debug that single file in your IDE — breakpoints land in your method,
console shows each case.
"""

from __future__ import annotations

import inspect
import os
import re
import sys
import traceback

from .parser import TestCase, parse_cases

# ANSI colours, disabled when not a tty or NO_COLOR is set.
_USE_COLOR = sys.stdout.isatty() and not os.environ.get("NO_COLOR")


def _c(code: str, text: str) -> str:
    return f"\033[{code}m{text}\033[0m" if _USE_COLOR else text


def _green(t: str) -> str:
    return _c("32", t)


def _red(t: str) -> str:
    return _c("31", t)


def _dim(t: str) -> str:
    return _c("2", t)


def _bold(t: str) -> str:
    return _c("1", t)


def _pick_method(solution_cls):
    """Find the single public solving method on a Solution class."""
    methods = [
        name
        for name, _ in inspect.getmembers(solution_cls, predicate=inspect.isfunction)
        if not name.startswith("_")
    ]
    if len(methods) == 1:
        return methods[0]
    if not methods:
        raise ValueError("Solution class has no public method to call.")
    raise ValueError(
        f"Solution has multiple public methods {methods}; "
        f"pass method= to run_tests to pick one."
    )


def _bind_args(func, kwargs: dict, instance):
    """Map parsed kwargs onto the method signature.

    LeetCode example names usually match the parameter names exactly. If the
    parser produced a single positional value ('_'), bind it to the first
    parameter. Extra/unknown keys are dropped with a warning.
    """
    sig = inspect.signature(func)
    params = [p for p in sig.parameters.values() if p.name != "self"]
    param_names = [p.name for p in params]

    if "_" in kwargs and len(param_names) == 1:
        return {param_names[0]: kwargs["_"]}, []

    bound = {}
    unknown = []
    for key, val in kwargs.items():
        if key in ("_positional",):
            continue
        if key in param_names:
            bound[key] = val
        else:
            unknown.append(key)
    return bound, unknown


def _equal(actual, expected, *, unordered: bool) -> bool:
    if unordered:
        try:
            return _normalise_unordered(actual) == _normalise_unordered(expected)
        except TypeError:
            pass
    return actual == expected


def _normalise_unordered(value):
    """Sort lists (and nested lists) so order doesn't matter for comparison."""
    if isinstance(value, list):
        inner = [_normalise_unordered(v) for v in value]
        try:
            return sorted(inner, key=repr)
        except TypeError:
            return inner
    return value


def _parse_only(only) -> set[int] | None:
    """Normalise the `only` selector into a set of 1-based case numbers.

    Accepts an int (3), an iterable of ints ([1, 3]), or a string like
    "3" or "1,3" (from the LC_ONLY env var / CLI). Returns None for "run all".
    """
    if only is None:
        return None
    if isinstance(only, int):
        return {only}
    if isinstance(only, str):
        nums = {int(p) for p in re.split(r"[,\s]+", only.strip()) if p}
        return nums or None
    return {int(n) for n in only}


def run_tests(
    solution_cls,
    cases_path: str | None = None,
    *,
    method: str | None = None,
    unordered: bool = False,
    only=None,
) -> int:
    """Run `solution_cls` against test cases. Returns the number of failures.

    cases_path defaults to `test_cases.txt` next to the caller's file.
    Set unordered=True for problems where any ordering of the output is valid.

    `only` runs just the given case(s) — by their 1-based number as printed
    ("case 3"). Accepts an int, a list of ints, or a string ("3" or "1,3").
    The LC_ONLY environment variable overrides this when set, so you can
    isolate a case from a run config / CLI without editing the file.
    """
    if cases_path is None:
        caller_file = inspect.stack()[1].filename
        cases_path = os.path.join(os.path.dirname(caller_file), "test_cases.txt")

    if not os.path.exists(cases_path):
        print(_red(f"No test cases file at {cases_path}"))
        return 1

    with open(cases_path, encoding="utf-8") as f:
        cases = parse_cases(f.read())

    if not cases:
        print(_dim(f"No test cases found in {os.path.basename(cases_path)}. "
                   "Paste some Input:/Output: examples into it."))
        return 0

    # LC_ONLY env var wins over the argument (lets you isolate without editing).
    selected = _parse_only(os.environ.get("LC_ONLY") or only)
    if selected is not None:
        valid = {n for n in selected if 1 <= n <= len(cases)}
        bad = selected - valid
        if bad:
            print(_dim(f"  ignoring out-of-range case number(s): {sorted(bad)} "
                       f"(have {len(cases)} case(s))"))
        if not valid:
            print(_red(f"No valid case to run from only={sorted(selected)}."))
            return 1
        selected = valid

    method_name = method or _pick_method(solution_cls)
    failures = 0

    if selected is None:
        print(_bold(f"Running {len(cases)} case(s) against "
                    f"{solution_cls.__name__}.{method_name}()\n"))
    else:
        print(_bold(f"Running case(s) {sorted(selected)} of {len(cases)} against "
                    f"{solution_cls.__name__}.{method_name}()\n"))

    for i, case in enumerate(cases, 1):
        if selected is not None and i not in selected:
            continue
        instance = solution_cls()
        func = getattr(instance, method_name)
        bound, unknown = _bind_args(func, case.kwargs, instance)
        if unknown:
            print(_dim(f"  case {i}: ignoring unknown arg(s): {unknown}"))

        try:
            actual = func(**bound)
        except Exception:
            failures += 1
            print(_red(f"✗ case {i} raised an exception"))
            print(_dim(f"    input: {case.raw}"))
            traceback.print_exc()
            print()
            continue

        if not case.has_expected:
            print(_dim(f"· case {i}  input: {case.raw}"))
            print(f"    output: {actual!r}  (no expected value to check)\n")
            continue

        if _equal(actual, case.expected, unordered=unordered):
            print(_green(f"✓ case {i}") + _dim(f"  {case.raw}"))
            print(_dim(f"    -> {actual!r}\n"))
        else:
            failures += 1
            print(_red(f"✗ case {i}") + _dim(f"  {case.raw}"))
            print(f"    expected: {case.expected!r}")
            print(f"    got:      {actual!r}\n")

    ran = len(selected) if selected is not None else len(cases)
    passed = ran - failures
    summary = f"{passed}/{ran} passed"
    print(_bold(_green(summary) if failures == 0 else _red(summary)))
    return failures
