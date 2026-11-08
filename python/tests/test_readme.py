# Copyright 2026 MB AFKzona Group
# SPDX-License-Identifier: AGPL-3.0-only
"""Runs the Python example in the main README.md."""

import contextlib
import io
import os
import re
import runpy
import tempfile
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


class ReadmeExample(unittest.TestCase):
    def test_python_example_runs(self):
        with open(os.path.join(ROOT, "README.md"), encoding="utf-8") as f:
            readme = f.read()
        m = re.search(r"<!-- example:python -->\n```python\n(.*?)```", readme, re.S)
        self.assertIsNotNone(m)
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "example.py")
            with open(path, "w", encoding="utf-8") as f:
                f.write(m.group(1).replace('open("', 'open(ROOT + "/').replace("import sourcebook as sb", "import sourcebook as sb\nROOT = " + repr(ROOT)))
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                runpy.run_path(path, run_name="__main__")
            self.assertIn("True", out.getvalue())
            self.assertIn("<!-- sourcebook:start -->", out.getvalue())


if __name__ == "__main__":
    unittest.main()
