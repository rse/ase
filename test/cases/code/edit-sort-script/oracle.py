##  the oracle code: the reference implementation of the behavior the generated
##  "sort.py" must show (reading integers from stdin, printing them in descending
##  order) -- this reference may freely use library functions, as the no-library
##  constraint applies only to the generated script (enforced by a regex oracle)

import sys

numbers = [ int(token) for token in sys.stdin.read().split() ]
for number in sorted(numbers, reverse=True):
    print(number)
