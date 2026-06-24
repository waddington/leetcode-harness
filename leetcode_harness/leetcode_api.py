"""Fetch problem metadata from LeetCode's public GraphQL API.

Used by `lc new <number>` to scaffold a problem: title, slug, the Python
code skeleton, and the example test cases parsed out of the HTML statement.

Network is optional — if it fails (offline, rate-limited), the scaffolder
falls back to an empty template you fill in by hand.
"""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from html import unescape

_GRAPHQL = "https://leetcode.com/graphql"
_ALL_PROBLEMS = "https://leetcode.com/api/problems/all/"

_HEADERS = {
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (leetcode-harness)",
    "Referer": "https://leetcode.com",
}


@dataclass
class Problem:
    number: int
    title: str
    slug: str
    skeleton: str = ""           # Python class Solution skeleton
    examples_text: str = ""      # extracted "Input:/Output:" lines
    difficulty: str = ""
    url: str = field(default="")

    def __post_init__(self):
        if not self.url and self.slug:
            self.url = f"https://leetcode.com/problems/{self.slug}/"


def _post(query: str, variables: dict) -> dict:
    payload = json.dumps({"query": query, "variables": variables}).encode()
    req = urllib.request.Request(_GRAPHQL, data=payload, headers=_HEADERS)
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode())


def _slug_for_number(number: int) -> tuple[str, str]:
    """Resolve a problem number to (slug, title) via the public index."""
    req = urllib.request.Request(_ALL_PROBLEMS, headers=_HEADERS)
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode())
    for item in data.get("stat_status_pairs", []):
        stat = item.get("stat", {})
        if stat.get("frontend_question_id") == number:
            return stat["question__title_slug"], stat["question__title"]
    raise LookupError(f"Problem number {number} not found in LeetCode index.")


_DETAIL_QUERY = """
query questionData($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    questionFrontendId
    title
    titleSlug
    difficulty
    content
    codeSnippets { lang langSlug code }
  }
}
"""


def _python_skeleton(snippets: list[dict]) -> str:
    by_lang = {s["langSlug"]: s["code"] for s in snippets or []}
    return by_lang.get("python3") or by_lang.get("python") or ""


def extract_examples(html_content: str) -> str:
    """Pull `Input: ... / Output: ...` pairs out of the HTML statement.

    LeetCode statements are HTML. We strip tags, unescape entities, then grab
    the lines that start with Input:/Output: (and the occasional Explanation:,
    which we drop). Returns text ready to drop into test_cases.txt.
    """
    if not html_content:
        return ""
    # Turn block boundaries into newlines so Input/Output land on their own lines.
    text = re.sub(r"<(/?(p|br|div|pre|li|ul|ol))[^>]*>", "\n", html_content, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    text = unescape(text)

    lines = []
    for raw in text.splitlines():
        line = raw.strip()
        if re.match(r"^(Input|Output)\s*:", line, re.I):
            lines.append(line)
    return "\n".join(lines)


def fetch_problem(number: int) -> Problem:
    """Fetch a problem by its LeetCode (frontend) number. Raises on failure."""
    slug, title = _slug_for_number(number)
    data = _post(_DETAIL_QUERY, {"titleSlug": slug})
    q = (data.get("data") or {}).get("question") or {}
    return Problem(
        number=number,
        title=q.get("title") or title,
        slug=q.get("titleSlug") or slug,
        difficulty=q.get("difficulty") or "",
        skeleton=_python_skeleton(q.get("codeSnippets")),
        examples_text=extract_examples(q.get("content") or ""),
    )
