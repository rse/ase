##
##  Agentic Software Engineering (ASE)
##  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
##  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
##

##  the fixture test suite of the "fibonacci-fleet" agent test case: it
##  black-box tests the agent-produced "fibonacci.py" in the directory of
##  $AGENT_TEST_PROJECT against the specification of the task fixture "task.md",
##  partly by comparing its output with the independent reference
##  implementation "reference()" below (standard library only, platform-independent)

import ast
import os
import subprocess
import sys
import unittest

PROJECT = os.environ.get("AGENT_TEST_PROJECT", os.getcwd())
PROGRAM = os.path.join(PROJECT, "fibonacci.py")


def run(args):
    """run the program with the interpreter of this suite and return (exit, stdout, stderr)"""
    proc = subprocess.run([ sys.executable, PROGRAM, *args ], input=b"",
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60)
    norm = lambda data: data.decode("utf-8", errors="replace").replace("\r\n", "\n")
    return proc.returncode, norm(proc.stdout), norm(proc.stderr)


def reference(n):
    """the reference implementation: the first n Fibonacci numbers F(0)..F(n-1)"""
    result, a, b = [], 0, 1
    for _ in range(n):
        result.append(a)
        a, b = b, a + b
    return result


class FibonacciTest(unittest.TestCase):

    def setUp(self):
        self.assertTrue(os.path.isfile(PROGRAM), f"program not found: {PROGRAM}")

    def check(self, n, expected):
        """the output for count n is exactly the expected numbers, one per line"""
        code, out, _ = run([ str(n) ])
        self.assertEqual(code, 0)
        self.assertEqual(out.splitlines(), [ str(x) for x in expected ])

    def check_error(self, args, message):
        code, out, err = run(args)
        self.assertEqual(code, 1)
        self.assertEqual(out, "")
        self.assertIn(message, err)

    def test_zero(self):
        self.check(0, [])

    def test_one(self):
        self.check(1, [ 0 ])

    def test_two(self):
        self.check(2, [ 0, 1 ])

    def test_ten(self):
        self.check(10, [ 0, 1, 1, 2, 3, 5, 8, 13, 21, 34 ])

    def test_hundred_is_exact(self):
        code, out, _ = run([ "100" ])
        self.assertEqual(code, 0)
        lines = out.strip().split("\n")
        self.assertEqual(len(lines), 100)
        self.assertEqual(lines[-1], "218922995834555169026")

    def test_matches_reference(self):
        self.check(500, reference(500))

    def test_large_count(self):
        code, out, _ = run([ "5000" ])
        self.assertEqual(code, 0)
        self.assertEqual(out.strip().split("\n")[-1], str(reference(5000)[-1]))

    def test_missing_argument(self):
        self.check_error([], "fibonacci: usage: fibonacci.py N")

    def test_too_many_arguments(self):
        self.check_error([ "3", "4" ], "fibonacci: usage: fibonacci.py N")

    def test_non_numeric(self):
        self.check_error([ "abc" ], "fibonacci: invalid count: abc")

    def test_negative(self):
        self.check_error([ "-3" ], "fibonacci: invalid count: -3")

    def test_fractional(self):
        self.check_error([ "2.5" ], "fibonacci: invalid count: 2.5")

    def test_imports_only_sys(self):
        with open(PROGRAM, "r", encoding="utf-8") as f:
            tree = ast.parse(f.read(), PROGRAM)
        modules = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                modules.update(alias.name.split(".")[0] for alias in node.names)
            elif isinstance(node, ast.ImportFrom):
                modules.add((node.module or "").split(".")[0])
            elif isinstance(node, ast.Call) and getattr(node.func, "id", None) == "__import__":
                modules.add("__import__")
        self.assertTrue(modules <= { "sys" }, f"imports other than sys: {sorted(modules - { 'sys' })}")


if __name__ == "__main__":
    unittest.main()
