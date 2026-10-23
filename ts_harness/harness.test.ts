import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parseAssignments, parseCases, parseValue } from "./parser.ts";
import { deepEqual, fmt, parseSignature, runTests } from "./runner.ts";
import type { RunOptions } from "./runner.ts";
import {
  ListNode,
  TreeNode,
  buildLinkedList,
  buildLinkedListWithNodes,
  buildTree,
  linkedListToList,
  treeToList,
} from "./structures.ts";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const RUNNER_URL = pathToFileURL(join(ROOT, "ts_harness", "runner.ts")).href;

// An LC_ONLY exported in the developer's shell would filter every run below.
const savedOnly = process.env.LC_ONLY;
delete process.env.LC_ONLY;

const tempDirs: string[] = [];
after(() => {
  if (savedOnly === undefined) delete process.env.LC_ONLY;
  else process.env.LC_ONLY = savedOnly;
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "lc-harness-"));
  tempDirs.push(dir);
  return dir;
}

function casesFile(text: string): string {
  const path = join(tempDir(), "test_cases.txt");
  writeFileSync(path, text);
  return path;
}

/** Run runTests with console.log captured; returns failures and the output. */
function run(fn: (...args: any[]) => unknown, cases: string, opts: RunOptions = {}) {
  const lines: string[] = [];
  const orig = console.log;
  console.log = (...args: unknown[]) => void lines.push(args.map(String).join(" "));
  try {
    const failures = runTests(fn, { casesPath: casesFile(cases), ...opts });
    return { failures, out: lines.join("\n") };
  } finally {
    console.log = orig;
  }
}

/** Assert the failure count, showing the captured output when it's wrong. */
function expectFailures(result: { failures: number; out: string }, n: number): void {
  assert.equal(result.failures, n, `expected ${n} failure(s); output was:\n${result.out}`);
}

// --- parser -------------------------------------------------------------------

test("parseValue handles JSON, Python-isms and bare words", () => {
  assert.deepEqual(parseValue("[1,[2,3],[]]"), [1, [2, 3], []]);
  assert.equal(parseValue("true"), true);
  assert.equal(parseValue("None"), null);
  assert.equal(parseValue("-2.5e1"), -25);
  assert.equal(parseValue("'a,b'"), "a,b");
  assert.equal(parseValue('"say \\"hi\\""'), 'say "hi"');
  assert.deepEqual(parseValue('["eat","tea"]'), ["eat", "tea"]);
  assert.deepEqual(parseValue("{'a': 1}"), { a: 1 });
  assert.equal(parseValue("tail connects to node index 1"), "tail connects to node index 1");
});

test("parseValue ignores __proto__ keys", () => {
  const obj = parseValue('{"__proto__": {"pos": 1}, "a": 2}') as Record<string, unknown>;
  assert.equal(Object.getPrototypeOf(obj), Object.prototype);
  assert.equal("pos" in obj, false);
  assert.deepEqual(parseAssignments("__proto__ = {}, a = 1"), { a: 1 });
});

test("parseAssignments splits on top-level commas only", () => {
  assert.deepEqual(parseAssignments('nums = [1,2,3,1], k = 3, s = "a, b"'), {
    nums: [1, 2, 3, 1],
    k: 3,
    s: "a, b",
  });
  assert.deepEqual(parseAssignments("[1,2]"), { _: [1, 2] });
  assert.deepEqual(parseAssignments(""), {});
});

test("parseCases matches the shared fixture (same file the Python parser is checked against)", () => {
  type Fixture = { name: string; text: string; cases: { kwargs: object; expected: unknown; hasExpected: boolean }[] };
  const fixtures = JSON.parse(readFileSync(join(ROOT, "tests", "fixtures", "parser_cases.json"), "utf-8")) as Fixture[];
  for (const fx of fixtures) {
    const got = parseCases(fx.text).map(({ kwargs, expected, hasExpected }) => ({ kwargs, expected, hasExpected }));
    assert.deepEqual(got, fx.cases, fx.name);
  }
});

// --- structures ---------------------------------------------------------------

test("linked lists round-trip, including cycles", () => {
  assert.deepEqual(linkedListToList(buildLinkedList([1, 2, 3])), [1, 2, 3]);
  assert.equal(buildLinkedList([]), null);
  const [head, nodes] = buildLinkedListWithNodes([3, 2, 0, -4], 1);
  assert.equal(nodes[3].next, nodes[1]);
  assert.deepEqual(linkedListToList(head), [3, 2, 0, -4]); // stops at the cycle
});

test("trees round-trip in level order, trimming trailing nulls", () => {
  for (const arr of [[3, 9, 20, null, null, 15, 7], [1, null, 2, 3], [], [1]]) {
    assert.deepEqual(treeToList(buildTree(arr)), arr);
  }
  assert.deepEqual(treeToList(buildTree([1, 2, null])), [1, 2]);
  assert.equal(buildTree([null]), null);
});

// --- signature parsing --------------------------------------------------------

test("parseSignature reads names and annotations, ignoring comments", () => {
  const src = `
    /**
     * class ListNode { constructor(val?: number, next?: ListNode | null) {} }
     */
    function groupAnagrams(strs: string[], m: Map<string, number[]> = new Map()): string[][] {
      return [];
    };
    function hasCycle(head: ListNode | null): boolean { return false; }
    const twoSum = (nums: number[], target: number): number[] => [];
  `;
  assert.deepEqual(parseSignature(src, "groupAnagrams"), {
    params: [
      { name: "strs", type: "string[]" },
      { name: "m", type: "Map<string, number[]>", optional: true },
    ],
    returnType: "string[][]",
  });
  assert.deepEqual(parseSignature(src, "hasCycle")?.params, [{ name: "head", type: "ListNode | null" }]);
  assert.deepEqual(parseSignature(src, "twoSum")?.params.map((p) => p.name), ["nums", "target"]);
  assert.equal(parseSignature(src, "missing"), null);
  assert.deepEqual(parseSignature("function f(...args: unknown[]) {}", "f")?.params, [
    { name: "args", type: "unknown[]", optional: true },
  ]);
});

test("parseSignature copes with strings, nested generics and typed consts", () => {
  const src = [
    'const url = "https://x//y"; function a(x: number): number { return x; }',
    "function b<T extends Array<number>>(xs: T): T { return xs; }",
    'function c(sep: string = ",", k: number): string { return sep; }',
    "const d: (n: number) => number = (n: number) => n;",
  ].join("\n");
  assert.deepEqual(parseSignature(src, "a")?.params, [{ name: "x", type: "number" }]);
  assert.deepEqual(parseSignature(src, "b")?.params, [{ name: "xs", type: "T" }]);
  assert.deepEqual(parseSignature(src, "c")?.params.map((p) => p.name), ["sep", "k"]);
  assert.deepEqual(parseSignature(src, "d")?.params, [{ name: "n", type: "number" }]);
  assert.equal(parseSignature(src, ""), null);
  assert.equal(parseSignature(src, "bound a"), null);
});

test("parseSignature stays fast on a pathological return annotation", () => {
  const src = `function f(a: number) :${" ".repeat(20_000)}x${" ".repeat(20_000)}`;
  const start = performance.now();
  parseSignature(src, "f");
  assert.ok(performance.now() - start < 500);
});

// --- comparison & display -----------------------------------------------------

test("deepEqual / fmt basics", () => {
  assert.ok(deepEqual([0, [1]], [-0, [1]]));
  assert.ok(!deepEqual(true, 1));
  assert.ok(deepEqual({ a: [1] }, { a: [1] }));
  assert.equal(fmt([1, "a", null, true]), '[1,"a",null,true]');
  assert.equal(fmt(undefined), "undefined");
});

test("fmt falls back to inspect() for non-JSON values without throwing", () => {
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.match(fmt(new Map([[1, 2]])), /Map/);
  assert.match(fmt(new Set([1])), /Set/);
  assert.equal(fmt(NaN), "NaN");
  assert.equal(fmt(10n), "10n");
  assert.match(fmt(cyclic), /Circular/);
});

// --- runTests -----------------------------------------------------------------

function containsNearbyDuplicate(nums: number[], k: number): boolean {
  const seen = new Map<number, number>();
  for (let i = 0; i < nums.length; i++) {
    const j = seen.get(nums[i]);
    if (j !== undefined && i - j <= k) return true;
    seen.set(nums[i], i);
  }
  return false;
}

const NEARBY_CASES = [
  "Input: k = 3, nums = [1,2,3,1]",
  "Output: true",
  "Input: nums = [1,2,3,1,2,3], k = 2",
  "Output: false",
  "Input: nums = [1,2,3,1,2,3], k = 2",
  "Output: true", // deliberately wrong
].join("\n");

test("runTests binds named args (in any order) and counts failures", () => {
  const all = run(containsNearbyDuplicate, NEARBY_CASES);
  expectFailures(all, 1);
  assert.match(all.out, /2\/3 passed/);
  expectFailures(run(containsNearbyDuplicate, NEARBY_CASES, { only: [1, 2] }), 0);
});

test("runTests rejects an only= selection with no valid case", () => {
  const r = run(containsNearbyDuplicate, NEARBY_CASES, { only: "9" });
  expectFailures(r, 1);
  assert.match(r.out, /No valid case to run/);
});

test("runTests honours LC_ONLY over the option", () => {
  const cases = "Input: nums = [1], k = 1\nOutput: true\nInput: nums = [1], k = 1\nOutput: false";
  process.env.LC_ONLY = "2";
  try {
    const r = run(containsNearbyDuplicate, cases, { only: 1 });
    expectFailures(r, 0);
    assert.match(r.out, /Running case\(s\) \[2\]/);
  } finally {
    delete process.env.LC_ONLY;
  }
});

function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}

function withDefault(nums: number[], k: number = 1): number {
  return nums.length * k;
}

test("runTests binds a single positional value and allows defaulted params", () => {
  expectFailures(run(sum, "Input: [1,2,3]\nOutput: 6"), 0);
  const r = run(withDefault, "Input: nums = [1,2]\nOutput: 2");
  expectFailures(r, 0);
  assert.doesNotMatch(r.out, /no value for/);
});

test("runTests fails a case whose required arg has no value (like Python's TypeError)", () => {
  const r = run(containsNearbyDuplicate, "Input: nums = [1,1]\nOutput: true");
  expectFailures(r, 1);
  assert.match(r.out, /no value for required arg\(s\) \["k"\]/);
});

function reverseList(head: ListNode | null): ListNode | null {
  let prev: ListNode | null = null;
  while (head) [head.next, prev, head] = [prev, head, head.next];
  return prev;
}

test("runTests builds linked lists and serialises node results", () => {
  expectFailures(run(reverseList, "Input: head = [1,2,3,4,5]\nOutput: [5,4,3,2,1]\nInput: head = []\nOutput: []"), 0);
});

function detectCycle(head: ListNode | null): ListNode | null {
  const seen = new Set<ListNode>();
  for (let n = head; n; n = n.next) {
    if (seen.has(n)) return n;
    seen.add(n);
  }
  return null;
}

const detectCycleUnannotated = (head: ListNode | null) => detectCycle(head);

function hasCycle(head: ListNode | null): boolean {
  return detectCycle(head) !== null;
}

const CYCLE_CASES = [
  "Input: head = [3,2,0,-4], pos = 1",
  "Output: tail connects to node index 1",
  "Input: head = [1], pos = -1",
  "Output: no cycle",
].join("\n");

test("runTests wires pos cycles and reports cycle-start as an index", () => {
  expectFailures(run(detectCycle, CYCLE_CASES), 0);
  expectFailures(run(detectCycleUnannotated, CYCLE_CASES), 0);
  const bool = "Input: head = [3,2,0,-4], pos = 1\nOutput: true\nInput: head = [1], pos = -1\nOutput: false";
  expectFailures(run(hasCycle, bool), 0);
});

function invertTree(root: TreeNode | null): TreeNode | null {
  if (root) [root.left, root.right] = [invertTree(root.right), invertTree(root.left)];
  return root;
}

test("runTests builds TreeNode args and serialises TreeNode results", () => {
  expectFailures(run(invertTree, "Input: root = [4,2,7,1,3,6,9]\nOutput: [4,7,2,9,6,3,1]\nInput: root = []\nOutput: []"), 0);
});

function mergeKLists(lists: Array<ListNode | null>): ListNode | null {
  const vals: number[] = [];
  for (let n of lists) for (; n; n = n.next) vals.push(n.val);
  return buildLinkedList(vals.sort((a, b) => a - b));
}

function children(root: TreeNode | null): (TreeNode | null)[] {
  return root ? [root.left, root.right] : [];
}

test("runTests converts arrays of lists / trees element by element", () => {
  expectFailures(run(mergeKLists, "Input: lists = [[1,4,5],[1,3,4],[2,6]]\nOutput: [1,1,2,3,4,4,5,6]\nInput: lists = []\nOutput: []"), 0);
  expectFailures(run(children, "Input: root = [1,2,3,null,4]\nOutput: [[2,null,4],[3]]"), 0);
});

function groupAnagrams(strs: string[]): string[][] {
  const groups = new Map<string, string[]>();
  for (const s of strs) {
    const key = [...s].sort().join("");
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return [...groups.values()];
}

test("runTests unordered mode ignores ordering at every level", () => {
  const cases = 'Input: strs = ["eat","tea","tan","ate","nat","bat"]\nOutput: [["bat"],["nat","tan"],["ate","eat","tea"]]';
  expectFailures(run(groupAnagrams, cases), 1);
  expectFailures(run(groupAnagrams, cases, { unordered: true }), 0);
});

function boom(n: number): number {
  if (n === 1) throw new Error("boom");
  return n;
}

test("runTests counts a thrown error as a failure and keeps going", () => {
  const r = run(boom, "Input: n = 1\nOutput: 1\nInput: n = 2\nOutput: 2");
  expectFailures(r, 1);
  assert.match(r.out, /case 1 raised an exception/);
  assert.match(r.out, /✓ case 2/);
  assert.match(r.out, /1\/2 passed/);
});

test("runTests falls back to fn.toString() when the function isn't in the caller's source", async () => {
  const dir = tempDir();
  const helper = join(dir, "helper.ts");
  // Build the name so its declaration doesn't appear in *this* file's source,
  // which is where runTests looks first.
  const name = ["reverse", "Helper"].join("");
  writeFileSync(helper, [
    `export function ${name}(head: any, k?: number): any {`,
    "  let prev = null;",
    "  while (head) { const next = head.next; head.next = prev; prev = head; head = next; }",
    "  return prev;",
    "}",
  ].join("\n"));
  const mod = await import(pathToFileURL(helper).href);
  const r = run(mod[name], "Input: head = [1,2,3]\nOutput: [3,2,1]");
  expectFailures(r, 0); // `head` is built as a list by name; optional `k` doesn't fail
  assert.match(r.out, new RegExp(`couldn't find function ${name}`));
});

// --- end-to-end: real solution files run by node ------------------------------

function runNode(file: string, cwd: string) {
  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: "1" };
  delete env.LC_ONLY;
  return spawnSync(process.execPath, [file], { cwd, env, encoding: "utf-8" });
}

test("the shipped 0219 solution.ts runs via node and finds its own test_cases.txt", () => {
  const sol = join(ROOT, "problems", "0219-contains-duplicate-ii", "solution.ts");
  const res = runNode(sol, ROOT);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /(\d+)\/\1 passed/);
});

test("a solution.ts finds the test_cases.txt beside it, whatever the cwd", () => {
  const dir = tempDir();
  writeFileSync(join(dir, "test_cases.txt"), "Input: a = 2, b = 3\nOutput: 5");
  writeFileSync(join(dir, "solution.ts"), [
    `import { runTests } from ${JSON.stringify(RUNNER_URL)};`,
    "function add(a: number, b: number): number { return a + b; }",
    "runTests(add);",
  ].join("\n"));
  const res = runNode(join(dir, "solution.ts"), tmpdir());
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /1\/1 passed/);
});
