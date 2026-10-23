"""Scaffolding: per-language solution files sharing one test_cases.txt."""

import os
import tempfile
import unittest
from unittest import mock

from leetcode_harness import scaffold
from leetcode_harness.leetcode_api import Problem, _skeleton


def _read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


class CreateProblemTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.problems = os.path.join(self._tmp.name, "problems")
        patcher = mock.patch.object(scaffold, "PROBLEMS_DIR", self.problems)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(self._tmp.cleanup)

    def test_second_language_reuses_dir_and_keeps_test_cases(self):
        target, _ = scaffold.create_problem(219, lang="py", offline=True)
        tc = os.path.join(target, "test_cases.txt")
        with open(tc, "w", encoding="utf-8") as f:
            f.write("Input: x = 1\nOutput: 1\n")

        target2, written = scaffold.create_problem(219, lang="ts", offline=True)

        self.assertEqual(target2, target)
        self.assertEqual(written, [os.path.join(target, "solution.ts")])
        self.assertEqual(_read(tc), "Input: x = 1\nOutput: 1\n")

    def test_existing_dir_is_found_by_number_even_offline(self):
        existing = os.path.join(self.problems, "0219-contains-duplicate-ii")
        os.makedirs(existing)
        target, _ = scaffold.create_problem(219, lang="ts", offline=True)
        self.assertEqual(target, existing)

    def test_existing_solution_raises_without_force(self):
        scaffold.create_problem(1, lang="ts", offline=True)
        with self.assertRaises(FileExistsError):
            scaffold.create_problem(1, lang="ts", offline=True)

    def test_force_rewrites_solution_but_never_test_cases(self):
        target, _ = scaffold.create_problem(1, lang="ts", offline=True)
        sol = os.path.join(target, "solution.ts")
        tc = os.path.join(target, "test_cases.txt")
        for path in (sol, tc):
            with open(path, "w", encoding="utf-8") as f:
                f.write("edited")

        _, written = scaffold.create_problem(1, lang="ts", offline=True, force=True)

        self.assertEqual(written, [sol])
        self.assertNotEqual(_read(sol), "edited")
        self.assertEqual(_read(tc), "edited")

    def test_unknown_language_is_rejected(self):
        with self.assertRaises(ValueError):
            scaffold.create_problem(1, lang="rb", offline=True)


class TsTemplateTest(unittest.TestCase):
    PROBLEM = Problem(number=206, title="Reverse Linked List", slug="reverse-linked-list", difficulty="Easy")

    def test_imports_node_classes_used_in_the_signature_and_calls_function(self):
        skeleton = (
            "/**\n * class ListNode {\n *   next: ListNode | null\n * }\n */\n\n"
            "function reverseList(head: ListNode | null): ListNode | null {\n\n};"
        )
        out = scaffold._ts_solution_file(self.PROBLEM, skeleton)
        self.assertIn('import { runTests, ListNode } from "#harness";', out)
        self.assertIn("runTests(reverseList);", out)

    def test_node_class_only_in_a_comment_is_not_imported(self):
        skeleton = "/** TreeNode */\nfunction f(n: number): number {\n};"
        out = scaffold._ts_solution_file(self.PROBLEM, skeleton)
        self.assertIn('import { runTests } from "#harness";', out)

    def test_generic_function_name_is_found(self):
        skeleton = "async function promiseAll<T>(functions: (() => Promise<T>)[]): Promise<T[]> {\n};"
        out = scaffold._ts_solution_file(self.PROBLEM, skeleton)
        self.assertIn("runTests(promiseAll);", out)

    def test_class_skeleton_comments_out_run_tests(self):
        skeleton = "class LRUCache {\n    constructor(capacity: number) {\n    }\n}"
        out = scaffold._ts_solution_file(self.PROBLEM, skeleton)
        self.assertIn("// runTests(...);", out)

    def test_offline_default_skeleton(self):
        out = scaffold._ts_solution_file(self.PROBLEM, "")
        self.assertIn("function solve(", out)
        self.assertIn("runTests(solve);", out)

    def test_header_fields_cannot_break_out_of_the_comment(self):
        evil = Problem(number=1, title="Two\nprocess.exit(9)", slug="two", difficulty="Easy")
        out = scaffold._ts_solution_file(evil, "")
        self.assertIn("// 1. Two process.exit(9)  [Easy]", out)
        self.assertNotIn("\nprocess.exit(9)", out)

    def test_slug_is_sanitised_in_the_dir_name(self):
        self.assertEqual(scaffold._dir_name(1, "../../etc"), "0001-etc")


class SkeletonPickTest(unittest.TestCase):
    def test_prefers_slugs_in_order(self):
        snippets = [
            {"langSlug": "python", "code": "py2"},
            {"langSlug": "python3", "code": "py3"},
            {"langSlug": "typescript", "code": "ts"},
        ]
        self.assertEqual(_skeleton(snippets, "python3", "python"), "py3")
        self.assertEqual(_skeleton(snippets, "typescript"), "ts")
        self.assertEqual(_skeleton(snippets, "rust"), "")
        self.assertEqual(_skeleton(None, "typescript"), "")


if __name__ == "__main__":
    unittest.main()
