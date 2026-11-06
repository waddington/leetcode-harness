# Coding round cheatsheet

## Approach (say it out loud)
1. **Read** problem + examples; restate one example in your own words
2. **Ask**: missing/bad fields? empty input? ties? input sorted? duplicates? size? return None or raise?
3. **MVP**: "Simplest version is X, O(?). Get it working, then improve."
4. **Code**, narrating decisions → **run** examples → **edge cases** → complexity
5. Stuck? "Let me think out loud…" brute force first · try a tiny example by hand
6. **Requirements change?** Keep the old tests running · add new behaviour as an optional param with a default · add your own test for the new case

## Data pipeline: the order
```
rows → 1 validate → 2 normalise → 3 dedupe → 4 exclude → 5 sort → 6 index/group → 7 aggregate → 8 shape output
```
| # | Step | Python | Why here |
|---|---|---|---|
| 1 | **Validate** (skip malformed) | `for row in rows:` `if not is_valid(row): continue` | Before unpacking (a short row crashes `a, b, c = row`), so use a loop, not a comprehension. Before dedupe, so a bad later row can't overwrite a good one |
| 2 | **Normalise** (one shape, defaults, types) | `job if len(job) == 4 else [*job, 0]` · `.strip().lower()` · `date.fromisoformat(s)` | Everything after can use one unpack line |
| 3 | **Dedupe** | last wins: `latest[(task, attempt)] = result` · first wins: `if k not in seen` | Key = whatever identifies ONE thing (often a tuple). Keep "valid but doesn't count" rows (e.g. `None` = crashed) in here |
| 4 | **Exclude** (valid, but doesn't count) | `if result is None: continue` | After dedupe: a crashed retry must still win over the earlier row |
| 5 | **Sort** (only if order matters) | `sorted(xs, key=lambda r: (r[1], r[0]))` | `key=` is keyword-only. Tuple = tie-breaks |
| 6 | **Index / group** | `{r[0]: r for r in rows}` · `defaultdict(list)` · adjacency map | Look things up O(1) instead of scanning |
| 7 | **Aggregate** | `Counter(t for t, _, _ in rows)` · `sum(...)` · best-per-key | `Counter[missing]` → 0, no KeyError |
| 8 | **Shape output** | `{k: round(w[k] / n, 2) for k, n in c.items() if n >= min_n}` · `sorted(reasons)` | Thresholds, rounding, sorting for deterministic output go LAST |

Rule: *"does this row exist?"* → before dedupe. *"does it count?"* → after dedupe. Keep each step separate (one comment each); twists usually change just one step.

## Core patterns
```python
from collections import defaultdict, Counter, deque
from dataclasses import dataclass
import heapq
from datetime import date, timedelta

groups = defaultdict(list); groups[key].append(x)    # group-by
d.setdefault(key, []).append(x)                      # same, plain dict
counts = Counter(xs); counts.most_common(3)          # count / top 3 [(k, n)]
best = {}                                            # best-per-key, one pass
if k not in best or cand < best[k]: best[k] = cand   #   cand = (price, name)
[x for x in xs if cond(x)]                           # filter (+ transform)
{k: v for k, v in d.items() if v >= n}               # dict filter
for k, (a, b) in d.items()                           # unpack values in the for line
for t, _, ok in rows                                 # _ = deliberately unused
x.get("field", default)                              # optional field
actual.get(table, {}).get(row_id)                    # nested lookup: {} default keeps chaining
if v is None or v <= 0: continue                     # None check FIRST
any(x.late for x in xs) / all(...) / sum(x.p for x in xs)
for i, x in enumerate(xs)  ·  for a, b in zip(xs, ys)  ·  for a, b in zip(xs, xs[1:])  # pairs
a & b  a | b  a - b                                  # set intersect / union / diff
date.fromisoformat("2026-11-02"); (d2 - d1).days; d + timedelta(days=3)
key = (customer, origin, dest)                       # tuples work as dict keys, lists don't
f"expected {want!r}, got {got!r}"                    # !r: 'open' vs 2 vs True vs None
```

## Sorting / picking
```python
sorted(xs, key=lambda x: (x.price, x.name))          # tuple = tie-breaks
sorted(xs, key=lambda x: (-x.rate, -x.n, x.name))    # negate numbers = desc
min(xs, key=...) · max(...) · sorted(...)[:3] · heapq.nsmallest(3, xs, key=...)
# desc on a STRING: sort twice (stable): secondary key first, then primary
# merge intervals / windows: sort by start, extend last group if gap <= window
```

## BFS (fewest steps) · Dijkstra (cheapest) · heap (most urgent)
```python
q = deque([(start, 0)]); seen = {start}              # {x} not set(x)!
while q:
    node, d = q.popleft()
    if node == goal: return d
    for nb in graph.get(node, []):
        if nb not in seen: seen.add(nb); q.append((nb, d + 1))
return -1

h = [(0, start)]; dist = {start: 0}                  # Dijkstra, weighted
while h:
    cost, node = heapq.heappop(h)                    # NOT h.pop()
    if node == goal: return cost
    if cost > dist.get(node, inf): continue          # stale entry
    for nb, w in graph[node]:
        if cost + w < dist.get(nb, inf): dist[nb] = cost + w; heapq.heappush(h, (cost + w, nb))
```

## Heap simulation (workers / sandboxes / queues)
```python
free = [(0, wid) for wid in range(n)]                # list of TUPLES; all-zero is already a heap
waiting = []                                         # (priority, arrival, id, duration)
i = 0; clock = 0                                     # i = next job to ARRIVE (say what it means!)
while i < len(jobs) or waiting:
    while i < len(jobs) and jobs[i][1] <= clock:     # admit ALL arrived (while, not if)
        heapq.heappush(waiting, (prio, arr, jid, dur)); i += 1
    t, wid = free[0]                                 # PEEK, don't pop
    if waiting and t <= clock:
        heapq.heappop(waiting); heapq.heappop(free)  # pop only when you commit
        heapq.heappush(free, (clock + dur + reset, wid))
        continue                                     # same clock: start another?
    clock += 1                                       # or jump: clock = next arrival / next free
```
Tuple order IS the tie-break rule · pending (sorted by arrival) → waiting (heap by priority) → running

## State / event replay (reducer)
```python
def apply(state, event):                             # returns NEW state, or None if invalid
    kind, tid, *args = event
    ...
    return {**state, tid: {**ticket, "status": "closed"}}   # copy, never mutate
# replay: for i, e in enumerate(events): new = apply(state, e); reject i if None else state = new
# undo: keep a stack of old states; pure apply makes that safe (no aliasing)
```

## Clean code
```python
@dataclass
class Rate: carrier: str; price: float; valid_to: date | None = None
```
Small helper fns (`is_valid(r)`) · clear names · early `continue`/`return` · no stray `print`s · final `else: return None` for unknown cases

## Complexity
dict/set lookup O(1) · list `in` O(n) · sort O(n log n) · heap push/pop O(log n) · BFS O(V+E)

## Gotchas
- `{}` is a dict; empty set `set()` · `set("AB")` → `{'A','B'}` · `deque([item])` needs a list
- `.append(x)` one item · `.extend(xs)` many · `[].extend()` returns None
- Don't mutate a list/dict while iterating it · default arg `def f(x=[])` is shared → use `None`
- Recursion depth ~1000 → iterative · int `//` vs float `/` · `round(x, 2)`
- **Truthiness:** `if x` drops `0`, `False`, `""` → use `if x is not None` when those are real values
- **Bools:** `1 == True` but `isinstance(1, bool)` is False → check `isinstance(v, bool)`, never `int`
- `x is 3` → `x == 3` (`is` = identity) · `x and x is not None` is just `x`
- `heappush(h, [(t, id)])` pushes a LIST → push the tuple · `heappush(h, [...many])` pushes ONE item
- `{**d}` copies one level only → inner dicts are shared (aliasing)
- Made a new variable (`sorted_jobs`)? Check the next line actually uses it, not the old one
- Changed what a variable means (`idx` = last vs next)? Find every use; leftover `+ 1` = bug
- Durations vs points in time: `clock + timeout`, not `timeout` · tests that all start at t=0 hide this

## Likely extensions → answers
top-k → sort/nsmallest · per-group → defaultdict · "why rejected" → return reasons list ·
streaming → heap/dict state updated per event · scale → index by key, avoid O(n²) ·
retries/duplicates → dedupe dict, last wins · priority → waiting heap · undo / time travel → pure apply + replay ·
bad data → validate step first · thresholds → final shaping step
