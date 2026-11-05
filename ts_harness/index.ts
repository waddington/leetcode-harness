/**
 * leetcode-harness (TypeScript): a tiny local harness for practising LeetCode.
 *
 * Public API:
 *     runTests(fn)  -- call at the bottom of a problem's solution.ts.
 *
 * Linked-list / tree problems work automatically: when your function is
 * annotated `head: ListNode | null` or `root: TreeNode | null`, array inputs in
 * test_cases.txt are built into real nodes (including cycles via `pos`), and
 * node results are serialised back to arrays for comparison. ListNode/TreeNode
 * and the builders are exported too, for constructing inputs by hand.
 */

export { runTests } from "./runner.ts";
export type { RunOptions } from "./runner.ts";
export { parseCases, parseAssignments, parseValue } from "./parser.ts";
export type { TestCase } from "./parser.ts";
export {
  ListNode,
  TreeNode,
  buildLinkedList,
  linkedListToList,
  buildTree,
  treeToList,
} from "./structures.ts";
