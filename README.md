# leetcode-harness

**Practice LeetCode in your IDE — real skeletons, real test cases, real breakpoints.**
Things the web UI can't give you.

[![Python](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Built with uv](https://img.shields.io/badge/built%20with-uv-de5fe9.svg)](https://github.com/astral-sh/uv)

The free LeetCode web editor gives you a textarea. No breakpoints, no autocomplete,
no stepping through your logic when a case fails. This harness pulls the **real
problem skeleton and the real example test cases** down to your machine, so you can
solve problems the way you actually write code — in your editor, with a debugger.

```bash
uv run lc new 219     # scaffold problem #219 (skeleton + tests, fetched from LeetCode)
# ...open solution.py, set a breakpoint, hit Debug...
uv run lc run 219     # ✓/✗ against the examples
```

> 💡 **Add a demo GIF here** — a breakpoint hitting mid-solution is the whole
> pitch. Drop it right under this line: `![demo](docs/demo.gif)`

---

## Why bother?

| On leetcode.com | With this harness |
| --- | --- |
| Textarea, no autocomplete | Full IDE: completion, type hints, refactors |
| `print` and pray | **Breakpoints**, watch expressions, step-through |
| Re-run the whole thing every time | Isolate and replay a single failing case |
| Copy-paste tests by hand | Skeleton **and** examples fetched for you |

---

## Setup (once)

```bash
uv sync
```

This creates `.venv` and installs the harness as an editable package, so
`from leetcode_harness import run_tests` resolves anywhere.

**PyCharm** — set the project interpreter to `.venv/bin/python`
(Settings → Project → Python Interpreter → Add → Existing → pick `.venv/bin/python`).
A shared run config **"Debug current solution"** is included — it runs whatever
`solution.py` you have open, using `.venv`. Open a `problems/*/solution.py`, set
breakpoints, and hit **Run** ▶ / **Debug** 🐞. (Or just use the green gutter arrow
next to `if __name__ == "__main__":`.)

**VS Code** — a launch config ("Debug current LeetCode solution") is included.
Open a `solution.py` and press **F5**.

---

## Workflow

### 1. Scaffold a problem by its LeetCode number

```bash
uv run lc new 219
```

Fetches the real Python skeleton **and** the example test cases straight from
LeetCode and writes:

```
problems/0219-contains-duplicate-ii/
  solution.py        # real skeleton + a __main__ runner
  test_cases.txt     # the examples, already filled in
```

Offline / fetch failed? It falls back to a blank template. Force with `--offline`
to skip the network entirely:

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

Prefer to paste the skeleton yourself (e.g. for a problem you typed in manually)?
Just replace the class body — the runner finds the single public method
automatically.

### 3. Add / edit test cases

`test_cases.txt` uses **LeetCode's own example syntax** — paste straight from the
problem page (or transcribe from a screenshot):

```
Input: nums = [1,2,3,1], k = 3
Output: true

Input: nums = [1,0,1,1], k = 1
Output: true
```

- Each `Input:` line starts a new case; the following `Output:` is the expected value.
- `true` / `false` / `null` are accepted (mapped to Python `True` / `False` / `None`).
- Nested lists, quoted strings, etc. all parse. Lines starting with `#` are comments.
- Example arg names (`nums`, `k`) are matched to your method's parameter names.

#### Linked lists & trees

Problems whose input is a **linked list or binary tree** work automatically —
no hand-written fixtures. Annotate your method with `ListNode` / `TreeNode` (the
LeetCode skeleton already does) and the harness builds the real structure from
the array in `test_cases.txt`, then serialises node results back to arrays to
check against `Output:`.

```
Input: head = [1,2,3,4,5]                # reverseList(head) -> Optional[ListNode]
Output: [5,4,3,2,1]

Input: root = [3,9,20,null,null,15,7]    # trees: level-order, null = missing child
Output: 3
```

- **Cycles** (*Linked List Cycle* etc.): a `pos` value links the tail back to
  that index — `Input: head = [3,2,0,-4], pos = 1`. `pos = -1` means no cycle.
- **Returning a node from a cyclic list** (*Linked List Cycle II*): the result
  is reported as that node's **index** in the list, and LeetCode's verbatim
  `Output: tail connects to node index 1` / `Output: no cycle` are understood.
- Plain `List[int]` params (e.g. two-sum's `nums`) are **not** converted — only
  `ListNode` / `TreeNode`-annotated params are.
- `ListNode`, `TreeNode` and the builders (`build_linked_list`, `build_tree`,
  `linked_list_to_list`, `tree_to_list`) are importable from `leetcode_harness`
  if you'd rather construct inputs by hand in `__main__`.

### 4. Run / debug

From your IDE: open `solution.py`, set breakpoints in your method, hit **Debug**.

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

---

## Tips

- **Debug one case in isolation** — when only case 3 is failing, run just that one
  so you can step through it cleanly. Three ways:
  - In `solution.py`: `run_tests(Solution, only=3)` (or `only=[1, 3]`), then Debug.
  - From the terminal: `uv run lc run 219 --only 3` (or `--only 1,3`).
  - Via env var (e.g. a PyCharm run-config "Environment variable"): `LC_ONLY=3`.
    `LC_ONLY` overrides the `only=` argument, so you can isolate without editing the
    file. Case numbers are 1-based, matching the printed `case N` labels.
- **Order-insensitive output** (problems where any valid ordering is accepted):
  call `run_tests(Solution, unordered=True)` in the `__main__` block.
- **Multiple methods on `Solution`** — pass `run_tests(Solution, method="myMethod")`.
- **No expected output** (you only pasted an `Input:`): the case runs and prints the
  result without asserting — handy for poking at behaviour.

---

## License

[MIT](LICENSE) © Kai Waddington
