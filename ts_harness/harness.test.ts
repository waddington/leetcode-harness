import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { parseAssignments, parseCases, parseValue } from "./parser.ts";
import { deepEqual, fmt, parseSignature, runTests } from "./runner.ts";
import {
  ListNode,
  buildLinkedList,
  buildLinkedListWithNodes,
  buildTree,
  linkedListToList,
  treeToList,
} from "./structures.ts";

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

test("parseAssignments splits on top-level commas only", () => {
  assert.deepEqual(parseAssignments('nums = [1,2,3,1], k = 3, s = "a, b"'), {
    nums: [1, 2, 3, 1],
    k: 3,
    s: "a, b",
  });
  assert.deepEqual(parseAssignments("[1,2]"), { _: [1, 2] });
  assert.deepEqual(parseAssignments(""), {});
});

test("parseCases reads blocks, comments, multi-line and missing outputs", () => {
  const cases = parseCases([
    "# comment",
    "Input: nums = [1,2,",
    "3], k = 1",
    "Output: false",
    "",
    "Input: s = \"abc\"",
    "Output: null",
    "Input: x = 1",
  ].join("\n"));
  assert.equal(cases.length, 3);
  assert.deepEqual(cases[0].kwargs, { nums: [1, 2, 3], k: 1 });
  assert.equal(cases[0].expected, false);
  assert.equal(cases[1].expected, null);
  assert.equal(cases[1].hasExpected, true);
  assert.equal(cases[2].hasExpected, false);
});

test("linked lists round-trip, including cycles", () => {
  assert.deepEqual(linkedListToList(buildLinkedList([1, 2, 3])), [1, 2, 3]);
  assert.equal(buildLinkedList([]), null);
  const [head, nodes] = buildLinkedListWithNodes([3, 2, 0, -4], 1);
  assert.equal(nodes[3].next, nodes[1]);
  assert.deepEqual(linkedListToList(head), [3, 2, 0, -4]); // stops at the cycle
});

test("trees round-trip in level order", () => {
  for (const arr of [[3, 9, 20, null, null, 15, 7], [1, null, 2, 3], [], [1]]) {
    assert.deepEqual(treeToList(buildTree(arr)), arr);
  }
});

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

test("deepEqual / fmt basics", () => {
  assert.ok(deepEqual([0, [1]], [-0, [1]]));
  assert.ok(!deepEqual(true, 1));
  assert.ok(deepEqual({ a: [1] }, { a: [1] }));
  assert.equal(fmt([1, "a", null, true]), '[1,"a",null,true]');
  assert.equal(fmt(undefined), "undefined");
});

// --- end-to-end through runTests ---------------------------------------------

function casesFile(text: string): string {
  const dir = mkdtempSync(join(tmpdir(), "lc-harness-"));
  const path = join(dir, "test_cases.txt");
  writeFileSync(path, text);
  return path;
}

function quiet<T>(f: () => T): T {
  const orig = console.log;
  console.log = () => {};
  try {
    return f();
  } finally {
    console.log = orig;
  }
}

function containsNearbyDuplicate(nums: number[], k: number): boolean {
  const seen = new Map<number, number>();
  for (let i = 0; i < nums.length; i++) {
    const j = seen.get(nums[i]);
    if (j !== undefined && i - j <= k) return true;
    seen.set(nums[i], i);
  }
  return false;
}

test("runTests binds named args (in any order) and counts failures", () => {
  const path = casesFile([
    "Input: k = 3, nums = [1,2,3,1]",
    "Output: true",
    "Input: nums = [1,2,3,1,2,3], k = 2",
    "Output: false",
    "Input: nums = [1,2,3,1,2,3], k = 2",
    "Output: true", // deliberately wrong
  ].join("\n"));
  assert.equal(quiet(() => runTests(containsNearbyDuplicate, { casesPath: path })), 1);
  assert.equal(quiet(() => runTests(containsNearbyDuplicate, { casesPath: path, only: [1, 2] })), 0);
  assert.equal(quiet(() => runTests(containsNearbyDuplicate, { casesPath: path, only: "9" })), 1);
});

test("runTests honours LC_ONLY over the option", () => {
  const path = casesFile("Input: nums = [1], k = 1\nOutput: true\nInput: nums = [1], k = 1\nOutput: false");
  process.env.LC_ONLY = "2";
  try {
    assert.equal(quiet(() => runTests(containsNearbyDuplicate, { casesPath: path, only: 1 })), 0);
  } finally {
    delete process.env.LC_ONLY;
  }
});

function reverseList(head: ListNode | null): ListNode | null {
  let prev: ListNode | null = null;
  while (head) [head.next, prev, head] = [prev, head, head.next];
  return prev;
}

function detectCycle(head: ListNode | null): ListNode | null {
  const seen = new Set<ListNode>();
  for (let n = head; n; n = n.next) {
    if (seen.has(n)) return n;
    seen.add(n);
  }
  return null;
}

function hasCycle(head: ListNode | null): boolean {
  return detectCycle(head) !== null;
}

test("runTests builds linked lists and serialises node results", () => {
  const path = casesFile("Input: head = [1,2,3,4,5]\nOutput: [5,4,3,2,1]\nInput: head = []\nOutput: []");
  assert.equal(quiet(() => runTests(reverseList, { casesPath: path })), 0);
});

test("runTests wires pos cycles and reports cycle-start as an index", () => {
  const cyc = casesFile([
    "Input: head = [3,2,0,-4], pos = 1",
    "Output: tail connects to node index 1",
    "Input: head = [1], pos = -1",
    "Output: no cycle",
  ].join("\n"));
  assert.equal(quiet(() => runTests(detectCycle, { casesPath: cyc })), 0);
  const bool = casesFile("Input: head = [3,2,0,-4], pos = 1\nOutput: true\nInput: head = [1], pos = -1\nOutput: false");
  assert.equal(quiet(() => runTests(hasCycle, { casesPath: bool })), 0);
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
  const path = casesFile([
    'Input: strs = ["eat","tea","tan","ate","nat","bat"]',
    'Output: [["bat"],["nat","tan"],["ate","eat","tea"]]',
  ].join("\n"));
  assert.equal(quiet(() => runTests(groupAnagrams, { casesPath: path })), 1);
  assert.equal(quiet(() => runTests(groupAnagrams, { casesPath: path, unordered: true })), 0);
});

test("runTests counts a thrown error as a failure and keeps going", () => {
  const path = casesFile("Input: n = 1\nOutput: 1\nInput: n = 2\nOutput: 2");
  const boom = (n: number): number => {
    if (n === 1) throw new Error("boom");
    return n;
  };
  assert.equal(quiet(() => runTests(boom, { casesPath: path })), 1);
});
