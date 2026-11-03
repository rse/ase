##
##  Agentic Software Engineering (ASE)
##  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
##  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
##

##  the fixture test suite of the "wordcount-python" agent test case: it
##  black-box tests the agent-produced "wordcount.py" in the directory of
##  $WORDCOUNT_PROJECT against the specification of the task fixture "task.md"
##  (standard library only, platform-independent)

import os
import shutil
import subprocess
import sys
import tempfile
import unittest

PROJECT = os.environ.get("WORDCOUNT_PROJECT", os.getcwd())
PROGRAM = os.path.join(PROJECT, "wordcount.py")


def run(args, stdin=b"", cwd=None):
    """run the program with the interpreter of this suite and return (exit, stdout, stderr)"""
    proc = subprocess.run([ sys.executable, PROGRAM, *args ], input=stdin,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=cwd, timeout=30)
    norm = lambda data: data.decode("utf-8", errors="replace").replace("\r\n", "\n")
    return proc.returncode, norm(proc.stdout), norm(proc.stderr)


def lines(text):
    """the non-empty output lines, with trailing whitespace removed"""
    return [ line.rstrip() for line in text.split("\n") if line.strip() != "" ]


class WordCountTest(unittest.TestCase):

    def setUp(self):
        self.assertTrue(os.path.isfile(PROGRAM), f"program not found: {PROGRAM}")
        self.dir = tempfile.mkdtemp(prefix="wordcount-suite-")

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def write(self, name, data):
        """write a fixture file (bytes, so no newline translation) and return its name"""
        with open(os.path.join(self.dir, name), "wb") as f:
            f.write(data)
        return name

    def check(self, args, expected, code=0, stdin=b""):
        exit_code, out, _ = run(args, stdin=stdin, cwd=self.dir)
        self.assertEqual(exit_code, code)
        self.assertEqual(lines(out), expected)

    def test_empty_file(self):
        self.check([ self.write("empty.txt", b"") ], [ "0 0 0 empty.txt" ])

    def test_single_line_without_newline(self):
        self.check([ self.write("a.txt", b"hello world") ], [ "0 2 11 a.txt" ])

    def test_multi_line(self):
        self.check([ self.write("b.txt", b"one two\nthree\n\nfour five six\n") ],
            [ "4 6 29 b.txt" ])

    def test_mixed_whitespace(self):
        self.check([ self.write("c.txt", b"  a\t\tb   c \n\t d\n") ], [ "2 4 16 c.txt" ])

    def test_unicode_characters(self):
        self.check([ self.write("u.txt", "grüße 😀 über\n".encode("utf-8")) ],
            [ "1 3 13 u.txt" ])

    def test_crlf_counts_carriage_returns(self):
        self.check([ self.write("w.txt", b"a b\r\nc\r\n") ], [ "2 3 8 w.txt" ])

    def test_stdin(self):
        self.check([], [ "2 3 6" ], stdin=b"a b\nc\n")

    def test_stdin_empty(self):
        self.check([], [ "0 0 0" ], stdin=b"")

    def test_multiple_files_with_total(self):
        a = self.write("a.txt", b"a b\nc\n")
        b = self.write("b.txt", b"x\n")
        self.check([ a, b ], [ "2 3 6 a.txt", "1 1 2 b.txt", "3 4 8 total" ])

    def test_single_file_has_no_total(self):
        _, out, _ = run([ self.write("a.txt", b"x\n") ], cwd=self.dir)
        self.assertNotIn("total", out)

    def test_missing_file(self):
        exit_code, out, err = run([ "missing.txt" ], cwd=self.dir)
        self.assertEqual(exit_code, 1)
        self.assertEqual(lines(out), [])
        self.assertIn("missing.txt", err)

    def test_missing_file_among_others(self):
        a = self.write("a.txt", b"a b\nc\n")
        b = self.write("b.txt", b"x\n")
        exit_code, out, err = run([ a, "missing.txt", b ], cwd=self.dir)
        self.assertEqual(exit_code, 1)
        self.assertEqual(lines(out), [ "2 3 6 a.txt", "1 1 2 b.txt", "3 4 8 total" ])
        self.assertIn("missing.txt", err)


if __name__ == "__main__":
    unittest.main()
