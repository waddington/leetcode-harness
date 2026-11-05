/**
 * Canonical ListNode / TreeNode and converters to/from LeetCode list notation
 * (TypeScript port of structures.py).
 *
 * LeetCode shows linked-list and tree examples as plain arrays, e.g.
 *
 *     Input: head = [3,2,0,-4], pos = 1     // linked list, with a cycle at index 1
 *     Input: root = [1,null,2,3]            // binary tree, level-order, null = missing
 *
 * These helpers let the runner turn those arrays into real node structures
 * before calling your function, and turn node results back into arrays for
 * comparison. The classes match the ones in LeetCode's TypeScript skeleton
 * comments, so `new ListNode(1)` / `.val` / `.next` behave as on the site.
 */

/** Singly-linked list node (LeetCode-compatible). */
export class ListNode {
  val: number;
  next: ListNode | null;

  constructor(val?: number, next?: ListNode | null) {
    this.val = val === undefined ? 0 : val;
    this.next = next === undefined ? null : next;
  }
}

/** Binary tree node (LeetCode-compatible). */
export class TreeNode {
  val: number;
  left: TreeNode | null;
  right: TreeNode | null;

  constructor(val?: number, left?: TreeNode | null, right?: TreeNode | null) {
    this.val = val === undefined ? 0 : val;
    this.left = left === undefined ? null : left;
    this.right = right === undefined ? null : right;
  }
}

/**
 * Array -> [head, nodes]. `nodes` is the list of created nodes in order.
 *
 * If `pos` >= 0, the tail's `.next` links back to the node at index `pos`,
 * forming a cycle (LeetCode's convention for linked-list-cycle problems).
 * `pos` < 0 means no cycle. The `nodes` list lets callers map a returned node
 * back to its index (e.g. Linked List Cycle II).
 */
export function buildLinkedListWithNodes(
  values: number[],
  pos = -1,
): [ListNode | null, ListNode[]] {
  if (!values.length) return [null, []];
  const nodes = values.map((v) => new ListNode(v));
  for (let i = 0; i + 1 < nodes.length; i++) nodes[i].next = nodes[i + 1];
  if (pos >= 0 && pos < nodes.length) nodes[nodes.length - 1].next = nodes[pos];
  return [nodes[0], nodes];
}

/** Array -> linked list head (see buildLinkedListWithNodes). */
export function buildLinkedList(values: number[], pos = -1): ListNode | null {
  return buildLinkedListWithNodes(values, pos)[0];
}

/** Linked list head -> array. Stops on a cycle (so it never hangs). */
export function linkedListToList(node: ListNode | null, limit = 10_000): number[] {
  const out: number[] = [];
  const seen = new Set<ListNode>();
  while (node !== null && node !== undefined) {
    if (seen.has(node)) break;
    seen.add(node);
    out.push(node.val);
    node = node.next;
    if (out.length > limit) break;
  }
  return out;
}

/** LeetCode level-order array (null = missing child) -> tree root. */
export function buildTree(values: (number | null)[]): TreeNode | null {
  if (!values.length || values[0] === null) return null;
  const root = new TreeNode(values[0]);
  const queue: TreeNode[] = [root];
  let i = 1;
  for (let q = 0; q < queue.length && i < values.length; q++) {
    const node = queue[q];
    const leftVal = values[i++];
    if (leftVal !== null && leftVal !== undefined) {
      node.left = new TreeNode(leftVal);
      queue.push(node.left);
    }
    if (i >= values.length) break;
    const rightVal = values[i++];
    if (rightVal !== null && rightVal !== undefined) {
      node.right = new TreeNode(rightVal);
      queue.push(node.right);
    }
  }
  return root;
}

/** Tree root -> LeetCode level-order array, trailing nulls trimmed. */
export function treeToList(root: TreeNode | null): (number | null)[] {
  if (root === null || root === undefined) return [];
  const out: (number | null)[] = [];
  const queue: (TreeNode | null)[] = [root];
  for (let q = 0; q < queue.length; q++) {
    const node = queue[q];
    if (node === null || node === undefined) {
      out.push(null);
      continue;
    }
    out.push(node.val);
    queue.push(node.left, node.right);
  }
  while (out.length && out[out.length - 1] === null) out.pop();
  return out;
}
