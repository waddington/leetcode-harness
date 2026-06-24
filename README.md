# leetcode-harness

A tiny local harness for practising LeetCode problems. Paste the skeleton, paste
the example test cases, then **Run/Debug the file from your IDE** — autocomplete,
console output, breakpoints, stepping all work. None of which the free LeetCode
web UI gives you.

## Setup (once)

```bash
uv sync
```

This creates `.venv` and installs the harness as an editable package, so
`from leetcode_harness import run_tests` resolves anywhere.

**PyCharm:** set the project interpreter to `.venv/bin/python`
(Settings → Project → Python Interpreter → Add → Existing → pick `.venv/bin/python`).
A shared run config **"Debug current solution"** is included — it runs whatever
`solution.py` you have open, using `.venv`. Open a `problems/*/solution.py`, set
breakpoints, and hit **Run** ▶ / **Debug** 🐞. (You can also just use the green
gutter arrow next to `if __name__ == "__main__":`.)

**VS Code:** a launch config ("Debug current LeetCode solution") is included —
open a `solution.py` and press F5.

## Workflow

### 1. Scaffold a problem by its LeetCode number

```bash
uv run lc new 219
```

This fetches the real Python skeleton **and** the example test cases straight
from LeetCode and writes:

```
problems/0219-contains-duplicate-ii/
  solution.py        # real skeleton + a __main__ runner
  test_cases.txt     # the examples, already filled in
```

Offline / fetch failed? It falls back to a blank template. Force with
`--offline` to skip the network entirely:

```bash
uv run lc new 219 --offline
```

### 2. Implement

Open `solution.py`. The skeleton matches LeetCode exactly, e.g.

```python
class Solution:
    def containsNearbyDuplicate(self, nums: List[int], k: int) -> bool:
        ...
```

If you'd rather paste the skeleton yourself (e.g. for a problem you typed in
manually), just replace the class body. The runner finds the single public
method automatically.

### 3. Add / edit test cases

`test_cases.txt` uses **LeetCode's own example syntax** — paste straight from
the problem page, including from a screenshot you transcribe:

```
Input: nums = [1,2,3,1], k = 3
Output: true

Input: nums = [1,0,1,1], k = 1
Output: true
```

- Each `Input:` line starts a new case; the following `Output:` is the expected value.
- `true`/`false`/`null` are accepted (mapped to Python `True`/`False`/`None`).
- Nested lists, quoted strings, etc. all parse. Lines starting with `#` are comments.
- The example arg names (`nums`, `k`) are matched to your method's parameter names.

### 4. Run / debug

From your IDE: open `solution.py`, set breakpoints in your method, hit Debug.

Or from the terminal:

```bash
uv run lc run 219          # by number
uv run lc run contains     # by partial name
uv run lc list             # list all scaffolded problems
```

Output:

```
Running 3 case(s) against Solution.containsNearbyDuplicate()

✓ case 1  nums = [1,2,3,1], k = 3
    -> True
✗ case 3  nums = [...], k = 2
    expected: False
    got:      True

2/3 passed
```

## Notes

- **Order-insensitive output** (problems where any valid ordering is accepted):
  call `run_tests(Solution, unordered=True)` in the `__main__` block.
- **Multiple methods on `Solution`**: pass `run_tests(Solution, method="myMethod")`.
- **No expected output** (you only pasted an `Input:`): the case runs and prints
  the result without asserting — handy for poking at behaviour.
```
