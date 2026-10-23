"""`lc run` language dispatch."""

import io
import os
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest import mock

from leetcode_harness import cli


class RunDispatchTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.problems = os.path.join(self._tmp.name, "problems")
        self.target = os.path.join(self.problems, "0219-contains-duplicate-ii")
        os.makedirs(self.target)
        patcher = mock.patch.object(cli, "PROBLEMS_DIR", self.problems)
        patcher.start()
        self.addCleanup(patcher.stop)
        # cli sets LC_ONLY from --only; don't leak it into other tests.
        saved = os.environ.pop("LC_ONLY", None)
        self.addCleanup(lambda: os.environ.pop("LC_ONLY", None) if saved is None
                        else os.environ.__setitem__("LC_ONLY", saved))

    def _touch(self, name):
        open(os.path.join(self.target, name), "w").close()

    def _run(self, *argv):
        out = io.StringIO()
        with redirect_stdout(out):
            rc = cli.main(["run", *argv])
        return rc, out.getvalue()

    def test_runs_every_language_present_without_lang(self):
        self._touch("solution.py")
        self._touch("solution.ts")
        with mock.patch.object(cli, "_run_solution", return_value=0) as run:
            rc, out = self._run("219")
        self.assertEqual(rc, 0)
        self.assertEqual([c.args[0] for c in run.call_args_list], ["py", "ts"])
        self.assertIn("── solution.py", out)
        self.assertIn("── solution.ts", out)

    def test_lang_picks_one(self):
        self._touch("solution.py")
        self._touch("solution.ts")
        with mock.patch.object(cli, "_run_solution", return_value=0) as run:
            rc, out = self._run("219", "--lang", "ts")
        self.assertEqual(rc, 0)
        run.assert_called_once_with("ts", os.path.join(self.target, "solution.ts"))
        self.assertNotIn("──", out)

    def test_missing_requested_language_suggests_lc_new(self):
        self._touch("solution.py")
        rc, out = self._run("219", "--lang", "ts")
        self.assertEqual(rc, 1)
        self.assertIn("uv run lc new 219 --lang ts", out)

    def test_no_solution_files(self):
        rc, out = self._run("219")
        self.assertEqual(rc, 1)
        self.assertIn("No solution file", out)

    def test_run_ts_invokes_node_with_only_in_env(self):
        self._touch("solution.ts")
        completed = mock.Mock(returncode=0)
        with mock.patch.object(cli.shutil, "which", return_value="/bin/node"), \
                mock.patch.object(cli, "_node_version", return_value=(26, 1)), \
                mock.patch.object(cli.subprocess, "run", return_value=completed) as run:
            rc, _ = self._run("219", "--only", "2")
        self.assertEqual(rc, 0)
        argv = run.call_args.args[0]
        self.assertEqual(argv, ["/bin/node", os.path.join(self.target, "solution.ts")])
        self.assertEqual(os.environ.get("LC_ONLY"), "2")

    def test_run_ts_without_node(self):
        self._touch("solution.ts")
        with mock.patch.object(cli.shutil, "which", return_value=None):
            rc, out = self._run("219")
        self.assertEqual(rc, 1)
        self.assertIn("Couldn't find `node`", out)

    def test_run_ts_with_old_node(self):
        self._touch("solution.ts")
        with mock.patch.object(cli.shutil, "which", return_value="/bin/node"), \
                mock.patch.object(cli, "_node_version", return_value=(20, 11)):
            rc, out = self._run("219")
        self.assertEqual(rc, 1)
        self.assertIn("needs Node 22.18+", out)


if __name__ == "__main__":
    unittest.main()
