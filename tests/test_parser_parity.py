"""The Python parser must agree with ts_harness/parser.ts on the shared fixture."""

import json
import os
import unittest

from leetcode_harness.parser import parse_cases, parse_value

FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "parser_cases.json")


class ParserParityTest(unittest.TestCase):
    def test_shared_fixture(self):
        with open(FIXTURE, encoding="utf-8") as f:
            fixtures = json.load(f)
        for fx in fixtures:
            with self.subTest(fx["name"]):
                got = [
                    {"kwargs": c.kwargs, "expected": c.expected, "hasExpected": c.has_expected}
                    for c in parse_cases(fx["text"])
                ]
                self.assertEqual(got, fx["cases"])

    def test_literal_words_inside_strings_are_left_alone(self):
        self.assertEqual(parse_value('"null"'), "null")
        self.assertEqual(parse_value("['a true b', null]"), ["a true b", None])


if __name__ == "__main__":
    unittest.main()
