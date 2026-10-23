/**
 * Run a solution function against parsed test cases and report PASS/FAIL
 * (TypeScript port of runner.py).
 *
 * Designed to be called at the bottom of a problem's `solution.ts` so you can
 * Run/Debug that single file in your IDE — breakpoints land in your function,
 * console shows each case.
 *
 * TypeScript types are erased at runtime, so where the Python runner reads
 * annotations, this one reads the function's signature out of the caller's
 * source file. That's how `nums = ...` binds to the right parameter and how
 * `head: ListNode | null` / `root: TreeNode | null` params get real nodes.
 */

import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inspect, isDeepStrictEqual } from "node:util";

import { parseCases } from "./parser.ts";
import {
  ListNode,
  TreeNode,
  buildLinkedListWithNodes,
  buildTree,
  linkedListToList,
  treeToList,
} from "./structures.ts";

// ANSI colours, disabled when not a tty or NO_COLOR is set.
const USE_COLOR = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

const c = (code: string, text: string): string =>
  USE_COLOR ? `\x1b[${code}m${text}\x1b[0m` : text;
const green = (t: string): string => c("32", t);
const red = (t: string): string => c("31", t);
const dim = (t: string): string => c("2", t);
const bold = (t: string): string => c("1", t);

type SolutionFn = (...args: any[]) => unknown;

export interface RunOptions {
  /** Run only these 1-based case(s): 3, [1, 3] or "1,3". LC_ONLY overrides. */
  only?: number | number[] | string;
  /** Set for problems where any ordering of the output is valid. */
  unordered?: boolean;
  /** Defaults to test_cases.txt next to the calling file. */
  casesPath?: string;
}

export interface Param {
  name: string;
  /** Annotation text, or "" when unannotated / unknown. */
  type: string;
  /** Rest (`...args`), optional (`k?`) or defaulted (`k = 1`): not required. */
  optional?: true;
}

export interface Signature {
  params: Param[];
  returnType: string;
}

type NodeKind = "list" | "tree" | null;

// --- signature parsing --------------------------------------------------------

function stripComments(src: string): string {
  // Block comments (LeetCode skeletons put the ListNode definition in one),
  // then line comments not preceded by ':' (so URLs in strings survive).
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

/** Split a parameter list on top-level commas, respecting generics like Map<K, V>. */
function splitParams(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if ("([{<".includes(ch)) depth++;
    else if (")]}".includes(ch) || (ch === ">" && text[i - 1] !== "=")) depth--;
    else if (ch === "," && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.filter((p) => p.trim());
}

/**
 * Find `function name(...)` (or `const name = (...) =>`) in `source` and
 * return its parameter names/annotations and return annotation.
 */
export function parseSignature(source: string, fnName: string): Signature | null {
  const src = stripComments(source);
  const name = fnName.replace(/[$]/g, "\\$");
  const re = new RegExp(
    `(?:\\bfunction\\s*\\*?\\s*${name}\\s*(?:<[^>]*>)?\\s*\\(` +
      `|\\b(?:const|let|var)\\s+${name}\\s*(?::[^=]+)?=\\s*(?:async\\s+)?(?:function\\b[^(]*)?\\()`,
  );
  const m = re.exec(src);
  if (!m) return null;

  const open = m.index + m[0].length - 1;
  let depth = 0;
  let close = -1;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")" && --depth === 0) {
      close = i;
      break;
    }
  }
  if (close < 0) return null;

  const params: Param[] = [];
  for (const seg of splitParams(src.slice(open + 1, close))) {
    const pm = /^\s*(\.\.\.)?([A-Za-z_$][\w$]*)\s*(\?)?\s*(?::\s*([\s\S]*?))?\s*(=(?!>)[\s\S]*)?$/.exec(seg);
    const param: Param = { name: pm ? pm[2] : "", type: pm?.[4]?.trim() ?? "" };
    if (pm && (pm[1] || pm[3] || pm[5])) param.optional = true;
    params.push(param);
  }
  const rm = /^\s*:\s*([^{=]+?)\s*(?:\{|=>)/.exec(src.slice(close + 1));
  return { params, returnType: rm ? rm[1].trim() : "" };
}

/** Fallback when the source can't be read: names only, from fn.toString(). */
function signatureFromFunction(fn: SolutionFn): Signature {
  const sig = parseSignature(fn.toString(), fn.name);
  if (sig) return sig;
  const m = /^[^(]*\(([^)]*)\)/.exec(fn.toString());
  const params = m
    ? splitParams(m[1]).map((p) => ({ name: p.trim().replace(/^\.\.\./, "").split(/[\s=:?]/)[0], type: "" }))
    : [];
  return { params, returnType: "" };
}

// Param names that conventionally hold a list / tree, used only when the
// signature has no annotation to go on.
const LIST_NAMES = new Set(["head", "headA", "headB", "l1", "l2", "list1", "list2"]);
const TREE_NAMES = new Set(["root", "root1", "root2"]);

function annotationKind(type: string): NodeKind {
  if (type.includes("ListNode")) return "list";
  if (type.includes("TreeNode")) return "tree";
  return null;
}

function paramKind(p: Param): NodeKind {
  if (p.type) return annotationKind(p.type);
  if (LIST_NAMES.has(p.name)) return "list";
  if (TREE_NAMES.has(p.name)) return "tree";
  return null;
}

// --- caller discovery ---------------------------------------------------------

const THIS_FILE = fileURLToPath(import.meta.url);

/** Path of the first stack frame outside this module (the solution file). */
function callerFile(): string | null {
  const orig = Error.prepareStackTrace;
  try {
    Error.prepareStackTrace = (_err, stack) => stack;
    const stack = new Error().stack as unknown as NodeJS.CallSite[];
    for (const site of stack) {
      let file = site.getFileName();
      if (!file || file.startsWith("node:")) continue;
      if (file.startsWith("file:")) file = fileURLToPath(file);
      if (file !== THIS_FILE) return file;
    }
  } finally {
    Error.prepareStackTrace = orig;
  }
  return null;
}

// --- binding & conversion -----------------------------------------------------

interface Ctx {
  indexMode: boolean;
  nodes: ListNode[];
}

/**
 * Map parsed kwargs onto the signature, building ListNode/TreeNode where the
 * param asks for one. A `pos` value (LeetCode's cycle index) is consumed to
 * wire a cycle into the linked-list argument instead of being reported as an
 * unknown arg.
 *
 * In `indexMode` (input has `pos` and the function returns a node, e.g. Linked
 * List Cycle II), the result is reported as the *index* of that node rather
 * than serialised as an array (which a cycle can't be).
 */
function bindArgs(
  sig: Signature,
  kwargs: Record<string, unknown>,
): { args: unknown[]; unknown: string[]; missing: string[]; ctx: Ctx } {
  const names = sig.params.map((p) => p.name);
  const args: unknown[] = new Array(names.length).fill(undefined);
  const given = new Set<number>();
  const unknown: string[] = [];

  if ("_" in kwargs && names.length === 1) {
    args[0] = kwargs["_"];
    given.add(0);
  } else if (names.length === 0) {
    // Couldn't read the signature: pass values in the order they were written.
    for (const [key, val] of Object.entries(kwargs)) {
      if (key !== "_positional") args.push(val);
    }
  } else {
    for (const [key, val] of Object.entries(kwargs)) {
      if (key === "_positional") continue;
      const idx = names.indexOf(key);
      if (idx >= 0) {
        args[idx] = val;
        given.add(idx);
      } else {
        unknown.push(key);
      }
    }
  }

  const pos = typeof kwargs["pos"] === "number" ? (kwargs["pos"] as number) : -1;
  let usedPos = false;
  let nodes: ListNode[] = [];
  sig.params.forEach((p, i) => {
    const kind = paramKind(p);
    if (kind === "list" && Array.isArray(args[i])) {
      const [head, built] = buildLinkedListWithNodes(args[i] as number[], pos);
      args[i] = head;
      nodes = built;
      usedPos = true;
    } else if (kind === "tree" && Array.isArray(args[i])) {
      args[i] = buildTree(args[i] as (number | null)[]);
    }
  });

  const missing = sig.params
    .filter((p, i) => p.name && !p.optional && !given.has(i))
    .map((p) => p.name);
  return {
    args,
    unknown: usedPos ? unknown.filter((u) => u !== "pos") : unknown,
    missing,
    ctx: { indexMode: "pos" in kwargs && annotationKind(sig.returnType) === "list", nodes },
  };
}

/** Serialise a ListNode/TreeNode result back to LeetCode notation. */
function convertOutput(sig: Signature, actual: unknown, ctx: Ctx): unknown {
  let kind = annotationKind(sig.returnType);
  if (kind === null) {
    if (actual instanceof ListNode) kind = "list";
    else if (actual instanceof TreeNode) kind = "tree";
  }
  if (kind === "list") {
    if (ctx.indexMode) {
      if (actual === null || actual === undefined) return null;
      const idx = ctx.nodes.indexOf(actual as ListNode);
      return idx >= 0 ? idx : -2; // node not part of the input list -> clearly wrong
    }
    return linkedListToList(actual as ListNode | null);
  }
  if (kind === "tree") return treeToList(actual as TreeNode | null);
  return actual;
}

/**
 * Normalise a cycle-start expected output to an index or null. Accepts
 * LeetCode's verbatim text ("tail connects to node index 1", "no cycle"), a
 * bare number, or null.
 */
function indexExpected(expected: unknown): unknown {
  if (expected === null || expected === undefined) return null;
  if (typeof expected === "number") return expected < 0 ? null : expected;
  if (typeof expected === "string") {
    const s = expected.trim().toLowerCase();
    if (s.includes("no cycle") || s === "null" || s === "none") return null;
    const m = /index\s+(-?\d+)/.exec(s);
    if (m) {
      const idx = Number(m[1]);
      return idx < 0 ? null : idx;
    }
  }
  return expected;
}

// --- comparison & display -----------------------------------------------------

/** Render a value in LeetCode-ish notation ([1,2], "s", true), else inspect(). */
export function fmt(value: unknown): string {
  if (value === undefined) return "undefined";
  let jsonish = true;
  try {
    const s = JSON.stringify(value, (_k, v: unknown) => {
      if (
        v === undefined || typeof v === "function" ||
        (typeof v === "number" && !Number.isFinite(v)) ||
        v instanceof Map || v instanceof Set
      ) {
        jsonish = false;
      }
      return v;
    });
    if (jsonish && s !== undefined) return s;
  } catch {
    // bigint / cycles -> fall through
  }
  return inspect(value, { depth: null, breakLength: Infinity });
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && Object.getPrototypeOf(v) === Object.prototype;
}

/** Structural equality where 0 and -0 are equal (LeetCode doesn't distinguish). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") return Number.isNaN(a) && Number.isNaN(b);
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every((k) => k in b && deepEqual(a[k], b[k]));
  }
  return isDeepStrictEqual(a, b);
}

/** Sort arrays (and nested arrays) so order doesn't matter for comparison. */
function normaliseUnordered(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value
    .map(normaliseUnordered)
    .map((v) => [fmt(v), v] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, v]) => v);
}

/**
 * Normalise the `only` selector into a set of 1-based case numbers. Accepts a
 * number, an array, or a string like "3" or "1,3". Returns null for "run all".
 */
function parseOnly(only: RunOptions["only"]): Set<number> | null {
  if (only === undefined || only === null || only === "") return null;
  if (typeof only === "number") return new Set([only]);
  if (typeof only === "string") {
    const nums = only.trim().split(/[,\s]+/).filter(Boolean).map(Number);
    return nums.length ? new Set(nums) : null;
  }
  return new Set(only.map(Number));
}

// --- entry point --------------------------------------------------------------

/**
 * Run `fn` against test cases. Returns the number of failures.
 *
 * Test cases default to `test_cases.txt` next to the calling file. `only`
 * runs just the given case(s) by their 1-based number as printed ("case 3");
 * the LC_ONLY environment variable overrides it, so you can isolate a case
 * from a run config / CLI without editing the file.
 */
export function runTests(fn: SolutionFn, options: RunOptions = {}): number {
  const caller = callerFile();
  const casesPath = options.casesPath ?? (caller ? join(dirname(caller), "test_cases.txt") : "test_cases.txt");

  if (!existsSync(casesPath)) {
    console.log(red(`No test cases file at ${casesPath}`));
    return 1;
  }

  const cases = parseCases(readFileSync(casesPath, "utf-8"));
  if (!cases.length) {
    console.log(dim(`No test cases found in ${basename(casesPath)}. ` +
      "Paste some Input:/Output: examples into it."));
    return 0;
  }

  // LC_ONLY env var wins over the option (lets you isolate without editing).
  let selected = parseOnly(process.env.LC_ONLY || options.only);
  if (selected !== null) {
    const valid = new Set([...selected].filter((n) => Number.isInteger(n) && n >= 1 && n <= cases.length));
    const bad = [...selected].filter((n) => !valid.has(n));
    if (bad.length) {
      console.log(dim(`  ignoring out-of-range case number(s): ${fmt(bad)} ` +
        `(have ${cases.length} case(s))`));
    }
    if (!valid.size) {
      console.log(red(`No valid case to run from only=${fmt([...selected])}.`));
      return 1;
    }
    selected = valid;
  }

  const fromSource = caller && existsSync(caller)
    ? parseSignature(readFileSync(caller, "utf-8"), fn.name)
    : null;
  const sig = fromSource ?? signatureFromFunction(fn);

  const label = `${fn.name || "solution"}()`;
  if (selected === null) {
    console.log(bold(`Running ${cases.length} case(s) against ${label}\n`));
  } else {
    const which = [...selected].sort((a, b) => a - b);
    console.log(bold(`Running case(s) ${fmt(which)} of ${cases.length} against ${label}\n`));
  }

  let failures = 0;
  cases.forEach((tc, idx) => {
    const i = idx + 1;
    if (selected !== null && !selected.has(i)) return;

    const { args, unknown, missing, ctx } = bindArgs(sig, tc.kwargs);
    if (unknown.length) console.log(dim(`  case ${i}: ignoring unknown arg(s): ${fmt(unknown)}`));
    if (missing.length) console.log(dim(`  case ${i}: no value for arg(s): ${fmt(missing)}`));

    let actual: unknown;
    try {
      actual = fn(...args);
    } catch (err) {
      failures++;
      console.log(red(`✗ case ${i} raised an exception`));
      console.log(dim(`    input: ${tc.raw}`));
      console.log(err instanceof Error && err.stack ? err.stack : err);
      console.log();
      return;
    }

    actual = convertOutput(sig, actual, ctx);

    if (!tc.hasExpected) {
      console.log(dim(`· case ${i}  input: ${tc.raw}`));
      console.log(`    output: ${fmt(actual)}  (no expected value to check)\n`);
      return;
    }

    const expected = ctx.indexMode ? indexExpected(tc.expected) : tc.expected;
    const equal = options.unordered
      ? deepEqual(normaliseUnordered(actual), normaliseUnordered(expected))
      : deepEqual(actual, expected);
    if (equal) {
      console.log(green(`✓ case ${i}`) + dim(`  ${tc.raw}`));
      console.log(dim(`    -> ${fmt(actual)}\n`));
    } else {
      failures++;
      console.log(red(`✗ case ${i}`) + dim(`  ${tc.raw}`));
      console.log(`    expected: ${fmt(expected)}`);
      console.log(`    got:      ${fmt(actual)}\n`);
    }
  });

  const ran = selected !== null ? selected.size : cases.length;
  const summary = `${ran - failures}/${ran} passed`;
  console.log(bold(failures === 0 ? green(summary) : red(summary)));
  return failures;
}
