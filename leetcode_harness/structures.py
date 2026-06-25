"""Canonical ListNode / TreeNode and converters to/from LeetCode list notation.

LeetCode shows linked-list and tree examples as plain arrays, e.g.

    Input: head = [3,2,0,-4], pos = 1     # linked list, with a cycle at index 1
    Input: root = [1,null,2,3]            # binary tree, level-order, null = missing

These helpers let the runner turn those arrays into real node structures before
calling your method, and turn node results back into arrays for comparison, so
`test_cases.txt` examples work for linked-list/tree problems with no manual
fixtures. Your method receives normal nodes and uses `.val` / `.next` /
`.left` / `.right` as usual.
"""

from __future__ import annotations

from collections import deque


class ListNode:
    """Singly-linked list node (LeetCode-compatible)."""

    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

    def __repr__(self):
        return f"ListNode({self.val})"


class TreeNode:
    """Binary tree node (LeetCode-compatible)."""

    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

    def __repr__(self):
        return f"TreeNode({self.val})"


def build_linked_list_with_nodes(values, pos=-1):
    """Array -> (head, nodes). `nodes` is the list of created nodes in order.

    If `pos` >= 0, the tail's `.next` links back to the node at index `pos`,
    forming a cycle (LeetCode's convention for linked-list-cycle problems).
    `pos` < 0 (or None) means no cycle. The `nodes` list lets callers map a
    returned node back to its index (e.g. Linked List Cycle II).
    """
    if not values:
        return None, []
    nodes = [ListNode(v) for v in values]
    for a, b in zip(nodes, nodes[1:]):
        a.next = b
    if pos is not None and pos >= 0:
        nodes[-1].next = nodes[pos]
    return nodes[0], nodes


def build_linked_list(values, pos=-1):
    """Array -> linked list head (see build_linked_list_with_nodes)."""
    head, _ = build_linked_list_with_nodes(values, pos)
    return head


def linked_list_to_list(node, limit=10_000):
    """Linked list head -> array. Stops on a cycle (so it never hangs)."""
    out = []
    seen = set()
    while node is not None:
        if id(node) in seen:
            break
        seen.add(id(node))
        out.append(node.val)
        node = node.next
        if len(out) > limit:
            break
    return out


def build_tree(values):
    """LeetCode level-order array (None = missing child) -> tree root."""
    if not values:
        return None
    it = iter(values)
    root_val = next(it)
    if root_val is None:
        return None
    root = TreeNode(root_val)
    queue = deque([root])
    while queue:
        node = queue.popleft()
        try:
            left_val = next(it)
        except StopIteration:
            break
        if left_val is not None:
            node.left = TreeNode(left_val)
            queue.append(node.left)
        try:
            right_val = next(it)
        except StopIteration:
            break
        if right_val is not None:
            node.right = TreeNode(right_val)
            queue.append(node.right)
    return root


def tree_to_list(root):
    """Tree root -> LeetCode level-order array, trailing None trimmed."""
    if root is None:
        return []
    out = []
    queue = deque([root])
    while queue:
        node = queue.popleft()
        if node is None:
            out.append(None)
            continue
        out.append(node.val)
        queue.append(node.left)
        queue.append(node.right)
    while out and out[-1] is None:
        out.pop()
    return out
