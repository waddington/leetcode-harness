# Coding round cheatsheet

## Approach (say it out loud)
1. **Read** problem + examples; restate one example in your own words
2. **Ask**: missing/bad fields? empty input? ties? input sorted? duplicates? size? return None or raise?
3. **MVP**: "Simplest version is X, O(?). Get it working, then improve."
4. **Code**, narrating decisions → **run** examples → **edge cases** → complexity
5. Stuck? "Let me think out loud…" brute force first · try a tiny example by hand

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
x.get("field", default)                              # optional field
if v is None or v <= 0: continue                     # None check FIRST
any(x.late for x in xs) / all(...) / sum(x.p for x in xs)
for i, x in enumerate(xs)  ·  for a, b in zip(xs, ys)  ·  for a, b in zip(xs, xs[1:])  # pairs
a & b  a | b  a - b                                  # set intersect / union / diff
date.fromisoformat("2026-11-02"); (d2 - d1).days; d + timedelta(days=3)
key = (customer, origin, dest)                       # tuples work as dict keys, lists don't
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
# event simulation: sort by time, pointer i, clock `now`; idle → jump; admit ≤ now; pop one
```

## Clean code
```python
@dataclass
class Rate: carrier: str; price: float; valid_to: date | None = None
```
Small helper fns (`is_valid(r)`) · clear names · early `continue`/`return` · no stray `print`s

## Complexity
dict/set lookup O(1) · list `in` O(n) · sort O(n log n) · heap push/pop O(log n) · BFS O(V+E)

## Gotchas
- `{}` is a dict; empty set `set()` · `set("AB")` → `{'A','B'}` · `deque([item])` needs a list
- `.append(x)` one item · `.extend(xs)` many · `[].extend()` returns None
- Don't mutate a list/dict while iterating it · default arg `def f(x=[])` is shared → use `None`
- Recursion depth ~1000 → iterative · int `//` vs float `/` · `round(x, 2)`

## Likely extensions → answers
top-k → sort/nsmallest · per-group → defaultdict · "why rejected" → return reasons list ·
streaming → heap/dict state updated per event · scale → index by key, avoid O(n²)
