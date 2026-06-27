@echo off
rem ##
rem ##  Agentic Software Engineering (ASE)
rem ##  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
rem ##  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
rem ##

setlocal

rem #   resolve our base directory
set "basedir=%~dp0"

rem #   pass-through execution
node "%basedir%ase.js" %*

endlocal

