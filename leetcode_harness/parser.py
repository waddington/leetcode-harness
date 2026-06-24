"""Parse LeetCode-style example test cases.

LeetCode shows examples like:

    Input: nums = [1,2,3,1], k = 3
    Output: true

This module turns blocks of that text into structured test cases so they can
be fed straight into your Solution method. The whole point: you paste the
example text *verbatim* from the problem page and it just works.

Supported value literals are Python literals plus the LeetCode JSON-isms
`true`/`false`/`null`, which get normalised to `True`/`False`/`None`.
"""

from __future__ import annotations

import ast
import re
from dataclasses import dataclass, field


@dataclass
class TestCase:
    """One example: keyword args for the method plus the expected output."""

    kwargs: dict = field(default_factory=dict)
    # `expected` may be absent (e.g. you only pasted an Input). `has_expected`
    # disambiguates "expected is None/null" from "no expected given".
    expected: object = None
    has_expected: bool = False
    # Raw source lines, kept for nicer error messages.
    raw: str = ""


def _normalise_literals(text: str) -> str:
    """Replace LeetCode's JSON-style tokens with Python equivalents.

    Done as whole-word replacements so we don't clobber identifiers or string
    contents like "nullable".
    """
    text = re.sub(r"\btrue\b", "True", text)
    text = re.sub(r"\bfalse\b", "False", text)
    text = re.sub(r"\bnull\b", "None", text)
    return text


def parse_value(text: str) -> object:
    """Parse a single value literal (the RHS of `name = value`)."""
    text = text.strip()
    if not text:
        raise ValueError("empty value")
    normalised = _normalise_literals(text)
    try:
        return ast.literal_eval(normalised)
    except (ValueError, SyntaxError):
        # Fall back to treating it as a bare string (e.g. an unquoted word).
        return text


def _split_top_level(text: str) -> list[str]:
    """Split on commas that are not inside brackets, braces, parens or quotes.

    `nums = [1,2,3], k = 3` -> ['nums = [1,2,3]', ' k = 3']
    """
    parts: list[str] = []
    depth = 0
    in_str: str | None = None
    start = 0
    i = 0
    while i < len(text):
        ch = text[i]
        if in_str:
            if ch == "\\":
                i += 2
                continue
            if ch == in_str:
                in_str = None
        elif ch in "\"'":
            in_str = ch
        elif ch in "[{(":
            depth += 1
        elif ch in "]})":
            depth -= 1
        elif ch == "," and depth == 0:
            parts.append(text[start:i])
            start = i + 1
        i += 1
    parts.append(text[start:])
    return [p for p in parts if p.strip()]


def parse_assignments(text: str) -> dict:
    """Parse `a = 1, b = [2,3]` into {'a': 1, 'b': [2, 3]}.

    If the text has no top-level `name =` (e.g. just `[1,2,3]`), the whole
    thing is treated as a single positional value under the key '_'.
    """
    text = text.strip()
    if not text:
        return {}

    segments = _split_top_level(text)
    result: dict = {}
    positional: list = []
    for seg in segments:
        # A top-level `=` that isn't `==`, `<=`, `>=`, `!=`.
        m = re.match(r"\s*([A-Za-z_]\w*)\s*=(?!=)\s*(.*)$", seg, re.DOTALL)
        if m:
            name, value = m.group(1), m.group(2)
            result[name] = parse_value(value)
        else:
            positional.append(parse_value(seg))

    if positional:
        if len(positional) == 1 and not result:
            result["_"] = positional[0]
        else:
            # Mixed/odd input; stash positionals so the runner can complain
            # usefully rather than silently dropping them.
            result.setdefault("_positional", []).extend(positional)
    return result


# Matches lines like "Input: ...", "Output: ...", case-insensitive, with an
# optional leading bullet/quote that sometimes survives a copy-paste.
_LABEL_RE = re.compile(r"^\s*[>|\-\*\s]*?(input|output|expected)\s*:\s*(.*)$", re.IGNORECASE)


def parse_cases(text: str) -> list[TestCase]:
    """Parse a whole `test_cases.txt` file into a list of TestCase.

    Blank lines and `#` comment lines are ignored. An `Input:` line starts a
    new case; the following `Output:`/`Expected:` line attaches the expected
    value. Lines are concatenated for multi-line inputs.
    """
    cases: list[TestCase] = []
    current: TestCase | None = None
    mode: str | None = None  # 'input' or 'output' — which buffer trailing lines append to
    in_buf: list[str] = []
    out_buf: list[str] = []

    def flush() -> None:
        nonlocal current, in_buf, out_buf
        if current is None:
            return
        in_text = " ".join(in_buf).strip()
        current.kwargs = parse_assignments(in_text)
        current.raw = in_text
        if out_buf:
            out_text = " ".join(out_buf).strip()
            assigns = parse_assignments(out_text)
            # Output is usually a bare value; if it parsed as a single '_'
            # positional, unwrap it.
            if set(assigns.keys()) == {"_"}:
                current.expected = assigns["_"]
            elif not assigns:
                current.expected = None
            else:
                current.expected = assigns
            current.has_expected = True
        cases.append(current)
        current = None
        in_buf = []
        out_buf = []

    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        m = _LABEL_RE.match(line)
        if m:
            label = m.group(1).lower()
            rest = m.group(2)
            if label == "input":
                flush()
                current = TestCase()
                mode = "input"
                in_buf = [rest] if rest.strip() else []
            else:  # output / expected
                mode = "output"
                out_buf = [rest] if rest.strip() else []
        else:
            # Continuation line for whichever section we're in.
            if mode == "input":
                in_buf.append(stripped)
            elif mode == "output":
                out_buf.append(stripped)
    flush()
    return cases
